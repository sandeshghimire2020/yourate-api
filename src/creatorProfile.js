// Fix the axios import to use direct import
const axios = require('axios');
const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.RATINGS_TABLE_NAME;

/**
 * Lambda function to get detailed information about a YouTube creator
 * including their channel details and all ratings/comments
 */
exports.handler = async (event) => {
    try {
        // Parse query parameters from the event
        const queryParams = event.queryStringParameters || {};
        const channelId = queryParams.channelId;
        
        if (!channelId) {
            return formatResponse(400, { error: 'Channel ID (channelId) is required' });
        }

        // YouTube API key (consider using env variables or SSM for production)
        const API_KEY = 'AIzaSyBffyuvOCf5PzbE-ZZri7cXB9fzQO2BtZA';
        
        try {
            // Get channel information from YouTube API
            const channelData = await getChannelDetails(channelId, API_KEY);
            
            // Get all ratings and comments for this channel from DynamoDB
            const ratingsData = await getChannelRatings(channelId, queryParams.limit, queryParams.nextToken);
            
            // Combine the data
            const response = {
                channelInfo: channelData,
                ratings: ratingsData
            };
            
            return formatResponse(200, response);
        } catch (innerError) {
            console.error('Error in API calls:', innerError);
            return formatResponse(500, { 
                error: 'Error processing request', 
                message: innerError.message || 'Unknown error',
                channelId: channelId
            });
        }
    } catch (error) {
        console.error('Error getting creator profile:', error);
        
        if (error.response) {
            return formatResponse(
                error.response.status || 500,
                { error: error.response.data?.error || 'API error', message: error.message }
            );
        }
        
        return formatResponse(500, { 
            error: 'Internal server error', 
            message: error.message || 'Unknown error'
        });
    }
};

/**
 * Get detailed information about a YouTube channel
 */
async function getChannelDetails(channelId, apiKey) {
    try {
        // Call YouTube API to get channel details
        const response = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
            params: {
                part: 'snippet,statistics,brandingSettings',
                id: channelId,
                key: apiKey
            },
            timeout: 10000 // Set a timeout of 10 seconds
        });
        
        if (response.data.items && response.data.items.length > 0) {
            return response.data.items[0];
        } else {
            // Instead of throwing an error, return a structured "not found" response
            return {
                id: channelId,
                status: 'not_found',
                message: 'Channel not found'
            };
        }
    } catch (error) {
        console.error('Error fetching channel details:', error);
        // Return error info instead of throwing
        return {
            id: channelId,
            status: 'error',
            message: error.message || 'Failed to fetch channel details',
            errorCode: error.response?.status || 'UNKNOWN'
        };
    }
}

/**
 * Get all ratings and comments for a channel with optional pagination
 */
async function getChannelRatings(channelId, limit = 20, nextToken = null) {
    try {
        // Query parameters for DynamoDB
        const params = {
            TableName: TABLE_NAME,
            KeyConditionExpression: 'channelId = :channelId',
            ExpressionAttributeValues: {
                ':channelId': channelId
            },
            ScanIndexForward: false, // Return most recent ratings first
            Limit: parseInt(limit, 10)
        };
        
        // Add pagination token if provided
        if (nextToken) {
            params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
        }
        
        const result = await dynamoDB.query(params).promise();
        
        // Calculate average rating if items exist
        if (result.Items && result.Items.length > 0) {
            const totalRatings = result.Items.reduce((sum, item) => sum + item.rating, 0);
            const averageRating = totalRatings / result.Items.length;
            
            // Format response with pagination
            const response = {
                channelId: channelId,
                averageRating: parseFloat(averageRating.toFixed(1)),
                totalRatings: result.Items.length,
                comments: result.Items.map(item => ({
                    comment: item.comment,
                    rating: item.rating,
                    timestamp: item.timestamp
                }))
            };
            
            // Add pagination token if there are more results
            if (result.LastEvaluatedKey) {
                response.nextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
            }
            
            return response;
        } else {
            return {
                channelId: channelId,
                averageRating: null,
                totalRatings: 0,
                comments: [],
                message: 'No ratings found for this channel'
            };
        }
    } catch (error) {
        console.error('Error querying DynamoDB for ratings:', error);
        throw error;
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