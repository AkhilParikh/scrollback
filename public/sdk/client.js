/*
 * This is version 2 of  the client side scrollback SDK.
 *
 * @author Aravind
 * copyright (c) 2012 Askabt Pte Ltd
 *
 *
 * Dependencies:
 *   - addEvent.js
 *   - domReady.js
 *   - getByClass.js
 *   - jsonml2.js
 */

"use strict";
var socket = io.connect(scrollback.host);
var timeAdjustment = 0;
var rooms = {}, requests = {}, lastPos;
var core = Object.create(emitter);
var nick = "";

socket.on('connect', function() {
	/* global scrollback, io, EventEmitter */
	if(scrollback.streams && scrollback.streams.length) {
		scrollback.streams.forEach(function(id) {
			if(!id) return;
			core.enter(id);
		});
	}
	console.log("Connected");
	core.emit('connected');
});

socket.on('disconnect', function() {
	var id;
	for(id in rooms) if(rooms.hasOwnProperty(id)) core.leave(id);
});

core.enter = function (id) {
	if(!rooms[id]) rooms[id] = { messages: messageArray() };
	message('result-start', id);
	message('back', id);
	core.emit('enter', id);
};

core.leave = function (id) {
	message('away', id);
	message('result-end', id);
	core.emit('leave', id);
//	delete rooms[id];
};

function guid() {
    var str="", i;
	for(i=0; i<32; i++) str += (Math.random()*16|0).toString(16);
	return str;
}

function message(type, to, text, ref) {
	var m = { id: guid(), type: type, from: nick, to: to, text: text || '', time: core.time(), ref: ref || '' };
	if (message.type != 'result-start' && message.type != 'result-end' && socket.socket.connected) {
		socket.emit('message', m);
	}
	if(rooms[to]) {
		rooms[to].messages.push(m);
		if(requests[to + '//']) requests[to + '//'](true);
	}
	return m;
}

function requestTime() { socket.emit('time', new Date().getTime()); }
requestTime(); setTimeout(requestTime, 300000);
socket.on('time', function(data) {
	// time adjustment is the time taken for outbound datagram to reach.
	timeAdjustment = data.server - data.request;
});
core.time = function() { return new Date().getTime() + timeAdjustment; };

socket.on('error', function(message) {
	console.log(message);
});

socket.on('messages', function(data) {
	var roomId = data.query.to, reqId = data.query.to + '/' + (data.query.since || '') +
			'/' + (data.query.until || '');
			
	console.log("Received", reqId, snapshot(data.messages));
	rooms[roomId].messages.merge(data.messages);
	console.log("Merged", snapshot(rooms[roomId].messages));
	
	if (requests[reqId]) {
		requests[reqId](true);
		if(reqId != data.query.to + '//') delete requests[reqId];
	}
	
});

core.get = function(room, start, end, callback) {
	var query = { to: room, type: 'text' },
		reqId;
	if (start) { query.since = start; }
	if (end) { query.until = end; }
	
	reqId = room + '/' + (query.since || '') + '/' + (query.until || '');
	
	console.log("Requesting from server: ", reqId);
	requests[reqId] = callback;
	socket.emit('messages', query);
};

socket.on('message', function(message) {
	var i, messages, updated = false;
	console.log("Message ", message);
	if (message.type == 'nick' && message.from == nick) {
		nick = message.ref;
		core.emit('nick', message.ref);
		return;
	}
	messages = rooms[message.to] && rooms[message.to].messages;
	if (!messages) return;
	for (i = messages.length - 1; i >= 0 && message.time - messages[i].time < 5000; i-- ) {
		if (messages[i].id == message.id) {
			messages[i] = message;
			updated = true; break;
		}
	}
	if (!updated) {
		messages.push(message);
	}
	if(requests[message.to + '//']) requests[message.to + '//'](true);
});

core.say = function (to, text) {
	message('text', to, text);
};

core.nick = function(n) {
	message('nick', '', '', n);
};

core.watch = function(room, time, before, after, callback) {
	function missing(start, end) {
		core.get(room, start, end, send);
		return { type: 'missing', text: 'Loading messages...', time: start };
	}
	function send(isResponse) {
		var r = rooms[room].messages.extract(
			time || core.time(), before || 32,
			after || 0, isResponse? null: missing
		);
		callback(r);
	}
	
	if (!time) {
		requests[room + '//'] = send;
	}
	send(false);
};

core.unwatch = function(room) {
	delete requests[room + '//'];
};

function snapshot (messages) {
	return messages.map(function(message) {
		switch (message.type) {
			case 'result-start': return '(';
			case 'result-end': return ')';
			case 'back': return '<';
			case 'away': return '>';
			case 'text': return '+';
			default: return '-';
		}
	}).join('');
}

/* TODO: implement them someday

core.occupants = function(query, callback) {}
core.followers = function(query, callback) {}
core.labels = function(query, callback) {}

*/
