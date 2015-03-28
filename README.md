# dynamo-scale
Auto Scaling for DynamoDB

**dynamo-scale** is a tool that automatically scales your Amazon DynamoDB throughput (Read/Write Capacity) based on the current utilization.

To start dynamo-scale just run 
```sh
node dynamodb.js
```
Or run it via ```forever``` or whatever you like.
But remember, that "logs" are written to stdout and not to files.

## Config
The Config is a simple JSON file. Edit **config.js** according to your needs.

AWS Settings Configuration schould be pretty clear. A list of regions and their corresponding region codes can be found [here](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html).
```javascript
"accessKeyId": "YOUR_ACCESS_KEY", 
"secretAccessKey": "YOUR_SECRET_ACCESS_KEY", 
"region": "eu-west-1",
```
Next comes the general application config. 
```javascript
"interval": 0,
"log": "all",
```
- ```interval``` is the timeout for auto scaling checks. It is set in seconds (```0``` = only run once).
- ```log``` defines what will be logged (on stdout). Possible values are ```all```, ```error``` or ```none```

The DynamoDB table configuration is set in the ```tables``` array.
```javascript
"tables": [
		{
			"name": "TestTable",
			"readCapacity": {
				"min": 20,
				"max": 200,
				"increaseAbovePercent": 80,
				"decreaseBelowPercent": 30,
				"increaseByPercent": 40,
				"decreaseByPercent": 40
			},
			"writeCapacity": {
				"min": 0,
				"max": 50,
				"increaseAbovePercent": 80,
				"decreaseBelowPercent": 30,
				"increaseByPercent": 30,
				"decreaseByPercent": 40
			}
		}
	]
```
- The ```tables``` array can contain multiple table-objects (one for each table)
- Each table is referred to by it's ```name```
- ```readCapacity``` has multiple values:
    - ```min```, the lowest Read Capacity **dynamo-scale** will fall back to
    - ```max```, the highest Read Capacity the applcation will use, even when your utilization goes beyond this value.
    - ```increaseAbovePercent``` the percentage of utilization you have to exceed before your throughput will be scaled up
    - ```decreaseBelowPercent``` the percentage of utilization below your throughput will be scaled down
    - ```increaseByPercent``` the percentage of current provisioned throughput your table will be scaled up by (Formula to calculate throughput after next increase: ```provisioned throuput * (1 + increaseByPercent/100)```). If your consumed throughput rises above 100% it will be scaled based on the actual throughput and not on your provisioned throughput.
    - ```decreaseByPercent``` the percentage of current provisioned throughput by which your table will be scaled down (Formula to calculate throughput after next decrease: ```provisioned throuput * (1 - decreaseByPercent/100)```)
- ```writeCapacity``` is the same as ```readCapacity```

To find the right values just play around until you hit the sweet spot.

This is my first *real* Github project. Pull requests are welcome :) 