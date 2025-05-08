const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.RATINGS_TABLE_NAME;

/**
 * Lambda function to handle ratings and comments for YouTube creators
 */
exports.handler = async (event) => {
    try {
        // Determine if this is a GET or POST request
        const httpMethod = event.httpMethod;
        
        if (httpMethod === 'GET') {
            return await handleGetRatings(event);
        } else if (httpMethod === 'POST') {
            return await handlePostRating(event);
        } else {
            return formatResponse(405, { error: 'Method not allowed' });
        }
    } catch (error) {
        console.error('Error processing rating request:', error);
        return formatResponse(500, { error: 'Internal server error', message: error.message });
    }
};

/**
 * Handle GET requests to fetch ratings for a specific YouTube channel
 */
async function handleGetRatings(event) {
    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const channelId = queryParams.channelId;
    
    if (!channelId) {
        return formatResponse(400, { error: 'Channel ID (channelId) is required' });
    }
    
    // Query DynamoDB for ratings/comments for this channel
    const params = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'channelId = :channelId',
        ExpressionAttributeValues: {
            ':channelId': channelId
        }
    };
    
    try {
        const result = await dynamoDB.query(params).promise();
        
        // Calculate average rating if items exist
        if (result.Items && result.Items.length > 0) {
            const totalRatings = result.Items.reduce((sum, item) => sum + item.rating, 0);
            const averageRating = totalRatings / result.Items.length;
            
            return formatResponse(200, {
                channelId: channelId,
                averageRating: averageRating.toFixed(1),
                totalRatings: result.Items.length,
                comments: result.Items.map(item => ({
                    comment: item.comment,
                    rating: item.rating,
                    timestamp: item.timestamp
                }))
            });
        } else {
            return formatResponse(404, { 
                message: 'No ratings found for this channel',
                channelId: channelId
            });
        }
    } catch (error) {
        console.error('Error querying DynamoDB:', error);
        return formatResponse(500, { error: 'Failed to retrieve ratings' });
    }
}

/**
 * Handle POST requests to add a new rating/comment
 */
async function handlePostRating(event) {
    // Parse the request body
    let body;
    try {
        body = JSON.parse(event.body);
    } catch (error) {
        return formatResponse(400, { error: 'Invalid request body' });
    }
    
    // Validate required fields
    const { channelId, channelTitle, rating, comment, email } = body;
    
    if (!channelId) {
        return formatResponse(400, { error: 'Channel ID is required' });
    }
    
    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
        return formatResponse(400, { error: 'Rating must be a number between 1 and 5' });
    }
    
    // Check if this email has already submitted a rating for this channel
    if (email) {
        try {
            const existingRatingsParams = {
                TableName: TABLE_NAME,
                KeyConditionExpression: 'channelId = :channelId',
                FilterExpression: 'email = :email',
                ExpressionAttributeValues: {
                    ':channelId': channelId,
                    ':email': email
                }
            };
            
            const existingRatings = await dynamoDB.query(existingRatingsParams).promise();
            
            if (existingRatings.Items && existingRatings.Items.length > 0) {
                return formatResponse(400, { 
                    error: 'You have already rated this channel', 
                    message: 'Each email can only submit one rating per channel'
                });
            }
        } catch (error) {
            console.error('Error checking for existing ratings:', error);
        }
    }
    
    // Prepare item for DynamoDB
    const timestamp = new Date().toISOString();
    const item = {
        channelId,
        timestamp,
        rating,
        comment: comment || '',
        channelTitle: channelTitle || '',
        email: email || ''
    };
    
    // Add additional creator information if provided
    if (body.thumbnailUrl) {
        item.thumbnailUrl = body.thumbnailUrl;
    }
    
    if (body.description) {
        item.description = body.description;
    }
    
    // Add optional profile picture URLs at different resolutions if provided
    if (body.profilePicture) {
        if (typeof body.profilePicture === 'object') {
            // Store the entire thumbnails object if it's provided as a structured object
            item.profilePicture = body.profilePicture;
        } else {
            // If it's a string, store it as the default URL
            item.profilePicture = { default: body.profilePicture };
        }
    }
    
    // Store the rating in DynamoDB
    const params = {
        TableName: TABLE_NAME,
        Item: item
    };
    
    try {
        await dynamoDB.put(params).promise();
        return formatResponse(201, { 
            message: 'Rating submitted successfully',
            timestamp: timestamp,
            channelId: channelId
        });
    } catch (error) {
        console.error('Error storing rating in DynamoDB:', error);
        return formatResponse(500, { error: 'Failed to save rating' });
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
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS,PUT,DELETE',
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Origin,Accept'
        },
        body: JSON.stringify(body)
    };
}