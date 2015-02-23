var log = require("../lib/logger.js");
module.exports = function(core, config) {
	log.d("Censor app config: ",config);
	core.on("getTexts", function(query, next) {
		if (/^internal/.test(query.session)) return next();

		if (!query.results || !query.results.length) return next();
		if (query.user.role === 'su') return next();

		query.results.forEach(function(e) {
			if(e && e.session) delete e.session;
		});
		next();
	}, "watcher");

	core.on("getRooms", function(query, next) {
		if (/^internal/.test(query.session)) return next();
		if (!query.results || !query.results.length) return next();

		function censor(e) {
			if (!e) return null;
			delete e.params;
			delete e.identities;
			return e;
		}
		if (query.ref && (query.user.role === 'su' || query.user.role == "owner")) return next();
		if (query.hasMember) {
			if (query.hasMember === query.user.id || query.hasMember === "me") {
				query.results.forEach(function(e) {
					if (e && e.role !== "owner") censor(e);
				});
			} else {
				query.results = query.results.map(censor);
			}
			return next();
		} else if (query.ref) {
			core.emit("getRooms", {
				hasMember: query.user.id,
				ref: query.ref,
				session: "internal-censor"
			}, function(err, q) {
                var roomMap = {};
                
				if (q.results && q.results.length) {
                   q.results.forEach(function(e) {
                       if(e && e.id) roomMap[e.id] = e;
                   });     
                }
                
				query.results = query.results.map(function(r) {
                    if(!roomMap[r.id] || roomMap[r.id].role != "owner") return censor(r);
                    else return r;
                });
                
				next();
			});
		} else {
			query.results = query.results.map(censor);
			next();
		}
	}, "watcher");

	core.on("getUsers", function(query, next) {
		if (/^internal/.test(query.session)) return next();

		if (!query.results || !query.results.length) return next();
		if (query.ref && (query.ref == "me" || query.user.role === 'su')) return next();
		query.results.forEach(function(e) {
			if (!e || e.id === query.user.id) return;
			delete e.params;
			delete e.identities;
			delete e.sessions;
		});

		next();
	}, "watcher");

};
