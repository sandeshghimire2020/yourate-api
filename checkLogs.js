const AWS = require('aws-sdk');
const logs = new AWS.CloudWatchLogs({ region: 'us-east-1' });

async function getLambdaLogs() {
  try {
    // List all log groups
    const logGroups = await logs.describeLogGroups().promise();
    
    console.log('Available log groups:', logGroups.logGroups.map(g => g.logGroupName));
    
    // Find log groups related to our creator profile function
    const lambdaLogGroups = logGroups.logGroups
      .filter(g => g.logGroupName.includes('/aws/lambda/creatorProfileFunction') || 
                  g.logGroupName.includes('profile'))
      .map(g => g.logGroupName);
    
    console.log('Lambda log groups found:', lambdaLogGroups);
    
    if (lambdaLogGroups.length === 0) {
      console.log('No Lambda log groups found for creator profile function');
      return;
    }
    
    // Get logs from the most recent Lambda function
    for (const logGroupName of lambdaLogGroups) {
      console.log(`\nFetching logs for ${logGroupName}:`);
      
      // Get all log streams, sorted by last event time (newest first)
      const streams = await logs.describeLogStreams({
        logGroupName,
        orderBy: 'LastEventTime',
        descending: true,
        limit: 5  // Increased to see more streams
      }).promise();
      
      if (!streams.logStreams || streams.logStreams.length === 0) {
        console.log('No log streams found for this function');
        continue;
      }
      
      console.log(`Found ${streams.logStreams.length} log streams`);
      
      for (const stream of streams.logStreams.slice(0, 3)) {  // Checking more streams
        console.log(`\nLog stream: ${stream.logStreamName}`);
        
        // Get more recent log events
        const logEvents = await logs.getLogEvents({
          logGroupName,
          logStreamName: stream.logStreamName,
          limit: 100  // Increased to see more logs
        }).promise();
        
        if (!logEvents.events || logEvents.events.length === 0) {
          console.log('No log events found');
          continue;
        }
        
        // Print the log events
        console.log(`Found ${logEvents.events.length} log events:`);
        logEvents.events.forEach(event => {
          console.log(`[${new Date(event.timestamp).toISOString()}] ${event.message}`);
        });
      }
    }
    
  } catch (error) {
    console.error('Error fetching logs:', error);
  }
}

getLambdaLogs();