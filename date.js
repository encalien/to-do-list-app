module.exports.getDate = getDate;

function getDate() {
	const today = new Date();
	const options = {
		weekday: "long",
		day: "numeric",
		month: "long"
	};
	return today.toLocaleDateString("en-UK", options);
};

exports.getDay = function() {
	const today = new Date();
	const options = {
		weekday: "long"
	};
	return today.toLocaleDateString("en-UK", options);
};
