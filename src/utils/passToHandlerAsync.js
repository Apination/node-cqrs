'use strict';

const getHandler = require('./getHandler');

module.exports = function passToHandlerAsync(context, messageType, ...args) {
	if (!context) throw new TypeError('context argument required');
	if (!messageType) throw new TypeError('messageType argument required');

	return new Promise(resolve => {
		const handler = getHandler(context, messageType);
		if (!handler)
			throw new Error(`'${messageType}' handler is not defined or not a function`);

		resolve(handler.apply(context, args));
	});
};
