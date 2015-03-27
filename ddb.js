var fs = require('fs');
var config = JSON.parse(fs.readFileSync('./config.json').toString());
var AWS = require('aws-sdk');

AWS.config.update({
	accessKeyId : config.accessKeyId,
	secretAccessKey : config.secretAccessKey,
	region : config.region
});

var DynamoTable = function(tableConf) {
	this.config = tableConf;
	this.tableName = tableConf.name;	
	this.dynamodb = new AWS.DynamoDB();
	this.cloudwatch = new AWS.CloudWatch();
};

DynamoTable.prototype = {
	
	//Get table information
	describe: function (cb) {
		this.dynamodb.describeTable({ TableName : this.tableName }, cb);
	},
	
	//Update table ReadCapacity and WriteCapacity
	update: function (newReadCapacity, newWriteCapacity, cb) {
		var params = {
			TableName : this.tableName,
			ProvisionedThroughput : {
				ReadCapacityUnits : newReadCapacity,
				WriteCapacityUnits : newWriteCapacity
			}
		};
		this.dynamodb.updateTable(params, cb);
	},
	
	//Get Cloudwatch metrics for table
	getMetric: function (metric, period, cb) {
		//Cloudwatch Api params
		//Last 30 minutes
		var params = {
			StartTime : new Date(new Date() - 30 * 60 * 1000).toISOString(),
			MetricName : metric,
			Namespace : 'AWS/DynamoDB',
			Period : period,
			EndTime : new Date().toISOString(),
			Statistics : [
				'Sum',
			],
			Dimensions : [{
					Name : 'TableName',
					Value : this.tableName
				}
			],
			Unit : 'Count'
		};

		this.cloudwatch.getMetricStatistics(params, function(err, data) {
			if(err) cb(err, false);
			capacityUsed = 0;
			if (data.Datapoints.length >= 3) {
				//Weighted Moving Average over 3 points to compensate for occasional Cloudwatch quirks
				capacityUsed = Math.ceil(((3 * data.Datapoints[data.Datapoints.length - 1].Sum / period) + (2 * data.Datapoints[data.Datapoints.length - 2].Sum / period) + (data.Datapoints[data.Datapoints.length - 3].Sum / period)) / 6);
			} else if (data.Datapoints.length > 0) {
				//No averaging if there are less than 3 datapoints available
				capacityUsed = Math.ceil(data.Datapoints[data.Datapoints.length - 1].Sum / period);
			}

			cb(false, capacityUsed);
		});
	},
};

module.exports = DynamoTable;
