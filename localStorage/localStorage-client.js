/* global localStorage */
/* global $, libsb, location, window */
var generate = require('../lib/generate');
var core;
var messageListener = false;
var domain = location.host;
var path = location.pathname;

var cacheOp = Object.create(require('./cacheOperations'));

cacheOp.update(); // updates client's LS version to current
cacheOp.load(); // initial load of all LS entries apart from ArrayCaches

module.exports = function (c) {
	core = c;

	core.on('back-dn', function (back, next) {
		if (back.from !== libsb.user.id) return next();

		// loading ArrayCache from LocalStorage when user has navigated to the room.
		window.backTimes[back.to] = back.time;

		var o;
		var key = cacheOp.generateLSKey(back.to, 'texts');
		var thKey = cacheOp.generateLSKey(back.to, 'threads');
		var roomName = back.to;
		var regex = new RegExp(roomName + '(_.+)?_' + 'texts');

		// load all ArrayCaches with <roomName>*_texts
		for (o in localStorage) {
			if (regex.test(o)) {
				cacheOp.loadArrayCache(o);
			}
		}
		// loading <roomName>_threads

		cacheOp.loadArrayCache(thKey);
		cacheOp.loadArrayCache(key);

		var items = cacheOp.cache[key].d;
		var lastMsg = items[items.length - 1];
		var time = lastMsg ? lastMsg.time : null;

		cacheOp.end('time', key, time);

		for (o in cacheOp.cache) {
			if (regex.test(o)) {
				cacheOp.end('time', o, time);
			}
		}
		next();
	}, 1000);

	core.on('back-dn', function (back, next) {
		// store a result-start in ArrayCache, to indicate the beginning of the current stream of messages from the user
		if (back.from !== libsb.user.id) return next();
		var key = cacheOp.generateLSKey(back.to, 'texts');

		cacheOp.start('time', key, back.time);

		var roomName = back.to;
		var regex = new RegExp(roomName + '(_.+)?_' + 'texts');
		for (var o in cacheOp.cache) {
			if (regex.test(o)) {
				cacheOp.start('time', o, back.time);
			}
		}

		next();
	}, 500);

	core.on('getTexts', function (query, next) {
		// getTextsBefore
		var key;

		if (query.thread) {
			// creating individual cache entries for queries with the thread property
			key = cacheOp.generateLSKey(query.to, query.thread, 'texts');
		} else {
			key = cacheOp.generateLSKey(query.to, 'texts');
		}
		if (!cacheOp.cache.hasOwnProperty(key)) {
			cacheOp.loadArrayCache(key);
		}

		if (!cacheOp.cache[key].d.length) {
			return next();
		}

		if (query.time === null) {
			// query.time is null, have to decide how LS will handle this.
			return next();
		}

		if (query.thread) return next();

		var results = cacheOp.cache[key].get('time', query);

		if (!results || !results.length) {
			return next();
		} else {
			query.results = results;
			query.resultSource = 'localStorage';
			return next();
		}
	}, 200); // runs before the socket

	core.on('getTexts', function (query, next) {
		if (query.resultSource == 'localStorage') {
			return next();
		}
		var results = query.results.slice(0); // copying by value
		if (results && results.length > 0) {
			// merging results into the Cache.
			if (query.before) {
				if (results.length === query.before) {
					results.unshift({
						type: 'result-start',
						time: results[0].time,
						endtype: 'limit'
					});
				}
				results.push({
					type: 'result-end',
					endtype: 'time',
					time: query.time
				});
			} else if (query.after) {
				if (results.length === query.after) {
					results.push({
						type: 'result-end',
						time: results[results.length - 1].time,
						endtype: 'limit'
					});
				}
				results.unshift({
					type: 'result-start',
					endtype: 'time',
					time: query.time
				});
			}
			var lskey = cacheOp.generateLSKey(query.to, 'texts');
			if (!cacheOp.cache.hasOwnProperty(lskey)) {
				cacheOp.loadArrayCache(lskey);
			}
			cacheOp.cache[lskey].put('time', results);

			if (query.thread) {
				// save into thread cache as well 
				var lsThreadKey = cacheOp.generateLSKey(query.to, query.thread, 'texts');
				if (!cacheOp.cache.hasOwnProperty(lsThreadKey)) {
					cacheOp.loadArrayCache(lsThreadKey);
				}
				cacheOp.cache[lsThreadKey].put('time', results);
				cacheOp.saveCache(lsThreadKey);
			}

			cacheOp.saveCache(lskey);
		}
		next();
	}, 8); // runs after the socket
	core.on('getThreads', function (query, next) {
		var key = cacheOp.generateLSKey(query.to, 'threads');
		if (!cacheOp.cache.hasOwnProperty(key)) {
			cacheOp.loadArrayCache(key);
		}

		if (!cacheOp.cache[key].d.length) {
			return next();
		}

		if (query.time === null) {
			// query.time is null, have to decide how LS will handle this.
			return next();
		}

		var results = cacheOp.cache[key].get('startTime', query);

		if (!results || !results.length) {
			return next();
		} else {
			query.results = results;
			query.resultSource = 'localStorage';
			return next();
		}
	}, 200); // runs before the socket

	core.on('getThreads', function (query, next) {
		if (query.resultSource === 'localStorage') {
			return next();
		}
		var results = query.results.slice(0); // copy by value
		if (results && results.length > 0) {
			// merge results to cache
			if (query.before) {
				if (results.length === query.before) {
					results.unshift({
						type: 'result-start',
						startTime: results[0].startTime,
						endtype: 'limit'
					});
				}
				results.push({
					type: 'result-end',
					endtype: 'time',
					startTime: query.time
				});
			} else if (query.after) {
				if (results.length === query.after) {
					results.push({
						type: 'result-end',
						startTime: results[results.length - 1].startTime,
						endtype: 'limit'
					});
				}
				results.unshift({
					type: 'result-start',
					endtype: 'time',
					startTime: query.time
				});
			}
			var lskey = cacheOp.generateLSKey(query.to, 'threads');
			if (!cacheOp.cache.hasOwnProperty(lskey)) {
				cacheOp.loadArrayCache(lskey);
			}
			cacheOp.cache[lskey].put('startTime', results);
			cacheOp.saveCache(lskey);
		}
		next();
	}, 8); // runs after socket 

	core.on('getRooms', function (query, next) {

		// only getRooms with ref are cached as of now.
		
		if (query.cachedRoom === false) {
			return next();
		}

		if (!query.ref) {
			return next();
		}

		var rooms = cacheOp.rooms || {};

		if (rooms.hasOwnProperty(query.ref)) {
			query.results = [rooms[query.ref]];
		}

		next();

	}, 400); // run before socket

	core.on('getRooms', function (query, next) {

		if (!query.ref) {
			return next();
		}

		var rooms = {};

		rooms = cacheOp.rooms ? cacheOp.rooms : {};

		if (query.results) {
			query.results.forEach(function (room) {
				rooms[room.id] = room;
				cacheOp.delRoomTimeOut(room.id);
			});
		}

		cacheOp.rooms = rooms;
		cacheOp.save();
		
		next();

	}, 8); // run after socket

	core.on('text-dn', function (text, next) {
		var key = cacheOp.generateLSKey(text.to, 'texts');
		cacheOp.loadArrayCache(key);
		var lastItem = cacheOp.cache[key].d[cacheOp.cache[key].length - 1];

		if (lastItem && lastItem.type === 'result-end') {
			cacheOp.start('time', key, window.backTimes[text.to]);
		}
		
		cacheOp.cache[key].d.push(text);
		cacheOp.saveCache(key);
		// putting the incoming text into each threadId cache it is a part of

		if (text.threads) {
			text.threads.forEach(function (threadObj) {
				key = cacheOp.generateLSKey(text.to, threadObj.id, 'texts');

				cacheOp.loadArrayCache(key);
				lastItem = cacheOp.cache[key].d[cacheOp.cache[key].length - 1];

				if (!lastItem || lastItem.type === 'result-end') {
					cacheOp.start('time', key, window.backTimes[text.to]);
				}
				cacheOp.cache[key].d.push(text);
				cacheOp.saveCache(key);
			});
		}

		next();
	}, 500); // storing new texts to cache.

	core.on('room-dn', function (room, next) {
		var roomObj = room.room;
		if (cacheOp.cache) {
			cacheOp.rooms = cacheOp.rooms ? cacheOp.cache.rooms : {};
			cacheOp.rooms[roomObj.id] = roomObj;
			cacheOp.save();
			cacheOp.delRoomTimeOut(roomObj.id);
		}
		next();
	}, 500);

	core.on('init-dn', function (init, next) {
		cacheOp.cache.user = init.user;
		cacheOp.cache.occupantOf = init.occupantOf;
		cacheOp.cache.memberOf = init.memberOf;

		// caching occupantOf and memberOf to cache.rooms

		cacheOp.rooms = cacheOp.rooms ? cacheOp.rooms : {};

		init.occupantOf.forEach(function (room) {
			cacheOp.rooms[room.id] = room;
			cacheOp.delRoomTimeOut(room.id);
		});

		init.memberOf.forEach(function (room) {
			cacheOp.rooms[room.id] = room;
			cacheOp.delRoomTimeOut(room.id);
		});

		cacheOp.save();
		next();
	}, 500);

	core.on('away-dn', function (away, next) {
		// store a result-end to the end of ArrayCache to show that the text stream is over for the current user
		if (away.from !== libsb.user.id) return next();
		var key = cacheOp.generateLSKey(away.to, 'texts');
		cacheOp.end('time', key, away.time);
		// soln below is generic for all subthreads in a room.

		var roomName = away.to;
		var regex = new RegExp(roomName + '(_.+)?_' + 'texts');
		for (var o in cacheOp.cache) {
			if (regex.test(o)) {
				cacheOp.end('time', o, away.time);
			}
		}

		next();
	}, 500);

	core.on('connected', function (data, next) {
		if (window.parent.location === window.location) {
			createInit();
			next();
		} else {
			if (!messageListener) {
				$(window).on("message", function (e) {
					var data = e.originalEvent.data;
					try {
						data = JSON.parse(data);
					} catch (e) {
						return;
					}
					if (typeof data === "object" && data.location) {
						domain = data.location.host;
						path = data.location.pathname;
					}
					createInit();
					next();
				});
				window.parent.postMessage("getDomain", "*");
				messageListener = true;
			} else {
				createInit();
				next();
			}
		}

	}, 1000);
	core.on('logout', logout, 1000);
};

function createInit() {
	var sid;
	if (!cacheOp.cache) {
		cacheOp.cache = {};
	}
	if (cacheOp.cache && cacheOp.cache.session) {
		libsb.session = sid = cacheOp.cache.session;
	}
	if (!sid) {
		cacheOp.cache.session = sid = "web://" + generate.uid();
		libsb.session = cacheOp.cache.session;
	}
	core.emit('init-up', {
		session: sid,
		origin: {
			gateway: "web",
			domain: domain,
			path: path
		}
	});
}

function logout(p, n) {
	// delete user session here
	delete cacheOp.cache.session;
	delete cacheOp.cache.user;
	delete libsb.session;
	delete libsb.user;
	localStorage.clear(); // clear LocalStorage on logout for security reasons
	cacheOp.save();
	n();
}