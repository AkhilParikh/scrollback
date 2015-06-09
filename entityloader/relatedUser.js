"use strict";
var core, userOps = require("../lib/user.js");


function checkPresense(room, user, callback) {
	core.emit("getUsers", {
		occupantOf: room,
		ref: user,
		session: "internal-loader"
	}, function(occupantErr, response) {
		var result = false;
		if (occupantErr || !response || !response.results || !response.results.length) result = false;
		else if (response.results[0] && response.results[0].id === user) result = true;
		return callback(result);
	});
}

function loadRelatedUser(room, user, session, callback) {
	var count = 0,
		queriesCount = 2,
		isErr = false, returnValue, presense = "offline";

	function done(error) {
		if (isErr) return;

		if (error) {
			isErr = true;
			callback(error);
			return;
		}

		count++;
		if (count === queriesCount) {
			returnValue.status = presense? "online" : "offline";
			callback(null, returnValue);
		}
	}

	core.emit("getUsers", {
		ref: user,
		session: session
	}, function(userErr, data) {
		if (userErr || !data || !data.results || !data.results.length) {
			return done(new Error("USER_NOT_FOUND"));
		} else {
			returnValue = data.results[0];
			if (userOps.isGuest(returnValue.id)) {
				returnValue.role = "guest";
				done();
			} else {
				core.emit("getUsers", {
					session: session,
					ref: user,
					memberOf: room
				}, function(memberErr, relations) {
					if(memberErr) return done(memberErr);
					if (!relations || !relations.results || !relations.results.length) {
						returnValue.role = "registered";
						done();
					} else {
						returnValue = relations.results[0];
						done();
					}
				});
			}
		}
	});
	
	
	checkPresense(room, user, function(result) {
		presense = result;
		done();
	});
}



function exp(c) {
	core = c;
	return loadRelatedUser;
}

module.exports = exp;