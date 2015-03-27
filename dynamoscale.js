var fs = require('fs');
var config = JSON.parse(fs.readFileSync('./config.json').toString());

var DynamoTable = require('./ddb.js');

// Simple log formatting
function log(type, msg) {
	if (type == 'head') {
		var d = new Date();
		console.log('\n[' + d.toTimeString().split(' ')[0] + '] ' + msg);
	} else {
		if (config.log == 'none') {
			return;
		} else if (type == 'info' && config.log != 'all') {
			return;
		} else if (type != 'error' && config.log == 'error') {
			return;
		}
		console.log('[' + type + '] ' + msg);
	}
}

// Check consumed Read/Write capacity for table
function checkTable(tableConf, cb) {
	log('head', 'Checking \'' + tableConf.name + '\'');

	var table = new DynamoTable(tableConf);
	var readsUsed = 0;
	var writesUsed = 0;

	table.getMetric('ConsumedReadCapacityUnits', 300, function(err, capacityUsed) {
		if(err) { 
		 	log('error', 'Error getting Cloudwatch metrics.');
			log('error', 'Do you have the cloudwatch:GetMetricStatistics permission?');
			return cb(err);
		}

		readsUsed = capacityUsed;
		table.getMetric('ConsumedWriteCapacityUnits', 300, function(err, capacityUsed) {
			if(err) { 
			 	log('error', 'Error getting Cloudwatch metrics.');
				log('error', 'Do you have the cloudwatch:GetMetricStatistics permission?');
				return cb(err);
			}
			writesUsed = capacityUsed;

			processResults(table, readsUsed, writesUsed, function(err) {
				return cb();
			});
		});
	});
}

// Get new Read/Write values based on config
function calculateNewValue(usedCapacity, provisionedCapacity, conf) {
	newValue = 0;
	usedPercent = Math.ceil(usedCapacity / provisionedCapacity * 100);
	if (usedPercent > conf.increaseAbovePercent) {
		newValue = Math.ceil(provisionedCapacity * (1 + conf.increaseByPercent / 100));

		// If more capacity is used than is available
		// base new value on used capacity instead of
		// provisioned capacity to prevent throttling
		if (usedPercent > 100) {
			newValue = Math.ceil(usedCapacity * (1 + conf.increaseByPercent / 100));
		}
	} else if (usedPercent < conf.decreaseBelowPervent) {
		newValue = Math.ceil(provisionedCapacity * (conf.decreaseByPercent / 100));

		if(usedPercent == 0) {
			newValue = conf.min;
		}
	}

	// Bind value to minimum configured capacity
	if(newValue < conf.min) {
		newValue = conf.min;
	}

	// Bind value to maximum configured capacity
	if(newValue > conf.max) {
		newValue = conf.max;
	};

	return newValue;
};

// Process results from Cloudwatch and scale if necessary
function processResults(table, readsUsed, writesUsed, cb) {
	table.describe(function(err, data) {
		if(err) { 
			log('error', 'Unable to describe table.');
			log('error', 'Do you have the dynamodb:DescribeTable permission?');
			return cb(err); 
		}

		var status = data.Table.TableStatus;
		var provisionedReadCapacity = data.Table.ProvisionedThroughput.ReadCapacityUnits;
		var provisionedWriteCapacity = data.Table.ProvisionedThroughput.WriteCapacityUnits;
		var decreasesRemaining = 4 - data.Table.ProvisionedThroughput.NumberOfDecreasesToday;

		if (status !== 'ACTIVE') {
			log('error', 'Table not active!');
			return cb(new Error('Table not active'));
		}

		log('info', 'ReadCapacity: ' + provisionedReadCapacity);
		log('info', 'WriteCapacity: ' + provisionedWriteCapacity);

		if (decreasesRemaining === 0) {
			log('warn', 'No decreases remaining (Limit: 4 per day)');
		} else {
			log('info', 'Decreases remaining: ' + decreasesRemaining.toString());
		}

		var readsUsedPercent = Math.ceil(readsUsed / provisionedReadCapacity * 100);
		var writesUsedPercent = Math.ceil(writesUsed / provisionedWriteCapacity * 100);

		log('info', 'Used ReadCapacity: ' + readsUsed.toString() + ' (' + readsUsedPercent + '%)');
		log('info', 'Used WriteCapacity: ' + writesUsed.toString() + ' (' + writesUsedPercent + '%)');

		var readConf = table.config.readCapacity;
		var newReads = calculateNewValue(readsUsed, provisionedReadCapacity, readConf);

		var writeConf = table.config.writeCapacity;
		var newWrites = calculateNewValue(writesUsed, provisionedWriteCapacity, writeConf);

		if (newReads != provisionedReadCapacity) {
			log('info', 'New ReadCapacity: ' + newReads);
		} else {
			log('info', 'ReadCapacity in healthy range');
		}

		if (newWrites != provisionedWriteCapacity) {
			log('info', 'New WriteCapacity: ' + newWrites);
		} else {
			log('info', 'WriteCapacity in healthy range');
		}

		// Update table if new capacity value is different from current throughput
		if (newReads != provisionedReadCapacity || newWrites != provisionedWriteCapacity) {
			table.update(newReads, newWrites, function (err, data) {
				if (!err) {
					log('info', 'Table has been updated (' + newReads.toString() + ', ' + newWrites.toString() + ').');
				} else {
					log('error', 'Error updating the table.');
					log('error', 'Do you have the dynamodb:UpdateTable permission?');
				}

				return cb();
			});
		} else {
			log('info', 'Nothing to change');
			return cb();
		}

	});
}

// Async-Loop through tables
var repeat = function (i) {
	if (i < config.tables.length) {
		checkTable(config.tables[i], function () {
			repeat(i + 1);
		});
	}
}

log('head', 'Dynamo-Scale started');
if (config.interval && config.interval > 0) {
	log('info', 'Check every ' + config.interval.toString() + ' seconds')
	log('info', 'Number of tables: ' + config.tables.length.toString());
	repeat(0);
	setInterval(function () {
		// Reload config
		config = JSON.parse(fs.readFileSync('./config.json').toString());
		repeat(0);
	}, config.interval * 1000);
} else {
	log('warn', 'No interval specified - running only once');
	log('info', 'Number of tables: ' + config.tables.length.toString());
	repeat(0);
}
