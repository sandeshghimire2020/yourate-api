const axios = require('aws-sdk/lib/axios-config').default;
const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.RATINGS_TABLE_NAME;

/**
 * Lambda function to search for YouTube creators by name or channel name
 * and include their ratings if available
 */
exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event));
    
    try {
        // Parse query parameters from the event, handling different API Gateway event formats
        let searchQuery = '';
        let maxResults = 5;
        
        if (event.queryStringParameters) {
            // Standard API Gateway format
            searchQuery = event.queryStringParameters.q || '';
            maxResults = parseInt(event.queryStringParameters.maxResults, 10) || 5;
        } else if (event.q) {
            // Direct invocation format
            searchQuery = event.q;
            maxResults = event.maxResults || 5;
        } else if (typeof event === 'string') {
            // Handle string input (sometimes API Gateway sends the body as string)
            try {
                const parsedEvent = JSON.parse(event);
                searchQuery = parsedEvent.q || '';
                maxResults = parsedEvent.maxResults || 5;
            } catch (e) {
                // If not valid JSON, use the string as query
                searchQuery = event;
            }
        }
        
        console.log('Processing search query:', searchQuery, 'and maxResults:', maxResults);
        
        if (!searchQuery) {
            return formatResponse(400, { error: 'Search query (q) is required' });
        }

        // Get YouTube API key from environment variables (no hardcoded keys)
        const API_KEY = process.env.YOUTUBE_API_KEY;
        if (!API_KEY) {
            console.error('YouTube API key not configured');
            return formatResponse(500, { error: 'Server configuration error' });
        }
        
        console.log('Calling YouTube API...');
        
        // Call YouTube API
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
                part: 'snippet',
                type: 'channel',
                q: searchQuery,
                maxResults: maxResults,
                key: API_KEY
            }
        });

        console.log('YouTube API response received');
        
        // Process the search results and add ratings data
        const youtubeResults = response.data.items || [];
        const enrichedResults = await addRatingsToResults(youtubeResults);
        
        // Return response with ratings data included
        const result = {
            ...response.data,
            items: enrichedResults
        };
        
        return formatResponse(200, result);
    } catch (error) {
        console.error('Error searching YouTube creators:', error);
        
        // Handle errors from YouTube API
        if (error.response) {
            return formatResponse(
                error.response.status,
                { error: error.response.data.error || 'YouTube API error' }
            );
        }
        
        return formatResponse(500, { error: 'Internal server error', message: error.message });
    }
};

/**
 * Add ratings data to YouTube search results if available
 */
async function addRatingsToResults(youtubeResults) {
    if (!youtubeResults || youtubeResults.length === 0) {
        return [];
    }
    
    // Get all the channel IDs
    const channelIds = youtubeResults.map(item => item.id.channelId);
    
    // Batch get ratings for these channels
    const ratingsPromises = channelIds.map(async (channelId) => {
        try {
            // Query DynamoDB for ratings for this channel
            const params = {
                TableName: TABLE_NAME,
                KeyConditionExpression: 'channelId = :channelId',
                ExpressionAttributeValues: {
                    ':channelId': channelId
                }
            };
            
            const result = await dynamoDB.query(params).promise();
            if (result.Items && result.Items.length > 0) {
                // Calculate average rating
                const totalRatings = result.Items.reduce((sum, item) => sum + item.rating, 0);
                return {
                    channelId,
                    averageRating: (totalRatings / result.Items.length).toFixed(1),
                    totalRatings: result.Items.length
                };
            }
            return null;
        } catch (error) {
            console.error(`Error fetching ratings for ${channelId}:`, error);
            return null;
        }
    });
    
    // Wait for all ratings queries to complete
    const ratingsResults = await Promise.all(ratingsPromises);
    
    // Create a map for easy lookup
    const ratingsMap = {};
    ratingsResults.forEach(rating => {
        if (rating) {
            ratingsMap[rating.channelId] = rating;
        }
    });
    
    // Enrich YouTube results with ratings
    return youtubeResults.map(item => {
        const channelId = item.id.channelId;
        if (ratingsMap[channelId]) {
            return {
                ...item,
                ratings: {
                    averageRating: ratingsMap[channelId].averageRating,
                    totalRatings: ratingsMap[channelId].totalRatings
                }
            };
        }
        return item;
    });
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
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
        },
        body: JSON.stringify(body)
    };
}