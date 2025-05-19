// filepath: /Users/dotoku/Github/yourate-api/src/recentRatings.js
const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.RATINGS_TABLE_NAME;

/**
 * Lambda function to fetch the most recent ratings across all channels
 * This handler must be exported as exactly 'handler' to match the Pulumi configuration
 */
exports.handler = async (event, context) => {
    try {
        // Include context in logging for better debugging
        console.log('Event received:', JSON.stringify(event));
        if (context) {
            console.log('Context:', JSON.stringify({
                functionName: context.functionName,
                awsRequestId: context.awsRequestId,
                logGroupName: context.logGroupName,
                logStreamName: context.logStreamName,
            }));
        }
        
        // Normalize event to handle different API Gateway formats
        let limit = 3; // Default to 3 most recent ratings
        
        // Parse query parameters, handling different possible formats
        if (event.queryStringParameters && event.queryStringParameters.limit) {
            limit = parseInt(event.queryStringParameters.limit, 10) || 3;
        } else if (event.limit) {
            // Handle direct invocation format
            limit = parseInt(event.limit, 10) || 3;
        } else if (event.body) {
            // Try to parse body if it exists (POST requests)
            try {
                const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
                if (body && body.limit) {
                    limit = parseInt(body.limit, 10) || 3;
                }
            } catch (e) {
                console.error('Error parsing request body:', e);
            }
        }
        
        console.log(`Using limit: ${limit}`);
        
        // Validate limit is reasonable
        if (limit < 1 || limit > 100) {
            limit = 3; // Reset to default if out of reasonable range
        }
        
        // Simple implementation for better reliability
        return await getRecentRatings(limit);
    } catch (error) {
        console.error('Error processing recent ratings request:', error);
        return formatResponse(500, { error: 'Internal server error', message: error.message });
    }
};

/**
 * Get the most recent ratings across all channels
 */
async function getRecentRatings(limit = 3) {
    try {
        console.log(`Table name from environment: ${TABLE_NAME}`);
        if (!TABLE_NAME) {
            console.error('TABLE_NAME environment variable is not defined');
            return formatResponse(500, { error: 'Configuration error', message: 'Missing table name configuration' });
        }
        
        // Use a simplified DynamoDB scan operation
        const params = {
            TableName: TABLE_NAME,
            Limit: 100 // Get enough items to sort through
        };
        
        console.log(`Scanning table ${TABLE_NAME} for ratings`);
        
        try {
            const data = await dynamoDB.scan(params).promise();
            console.log(`Scan results: ${data.Items ? data.Items.length : 0} items found`);
            
            if (!data.Items || data.Items.length === 0) {
                return formatResponse(404, { message: 'No ratings found' });
            }
            
            // Sort by timestamp (newest first)
            const sortedItems = data.Items.sort((a, b) => {
                // Default timestamps if missing
                const timeA = a.timestamp ? a.timestamp : '1970-01-01T00:00:00.000Z';
                const timeB = b.timestamp ? b.timestamp : '1970-01-01T00:00:00.000Z';
                
                // Try to parse as dates, if fails use string comparison
                try {
                    return new Date(timeB) - new Date(timeA); 
                } catch (e) {
                    return timeB.localeCompare(timeA);
                }
            });
            
            // Take only the requested number of items
            const recentRatings = sortedItems.slice(0, limit);
            
            // Map to clean response format
            const response = {
                count: recentRatings.length,
                ratings: recentRatings.map(item => ({
                    channelId: item.channelId || '',
                    channelTitle: item.channelTitle || '',
                    rating: typeof item.rating === 'number' ? item.rating : 0,
                    comment: item.comment || '',
                    timestamp: item.timestamp || '',
                    thumbnailUrl: item.thumbnailUrl || ''
                }))
            };
            
            return formatResponse(200, response);
            
        } catch (dbError) {
            console.error('DynamoDB error:', dbError);
            return formatResponse(500, { 
                error: 'Database error', 
                message: dbError.message || 'Failed to query database'
            });
        }
    } catch (error) {
        console.error('Error in getRecentRatings:', error);
        return formatResponse(500, { error: 'Failed to retrieve recent ratings' });
    }
}

/**
 * Format the API Gateway response
 */
function formatResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Origin,Accept'
        },
        body: JSON.stringify(body)
    };
}