const AWS = require('aws-sdk');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.RATINGS_TABLE_NAME;
const axios = require('axios');

// Default minimum number of ratings required to be included in top creators
const DEFAULT_MIN_RATINGS = 1;

/**
 * Lambda function to get top YouTube creators sorted by highest average rating
 */
exports.handler = async (event) => {
    try {
        console.log('Event received:', JSON.stringify(event));
        
        // Parse query parameters
        const queryParams = event.queryStringParameters || {};
        const limit = parseInt(queryParams.limit, 10) || 10; // Default to 10 items per page
        const nextToken = queryParams.nextToken;
        const minRatings = parseInt(queryParams.minRatings, 10) || DEFAULT_MIN_RATINGS; // Minimum ratings threshold
        
        console.log(`Using parameters: limit=${limit}, minRatings=${minRatings}`);

        // Get top creators with pagination
        const result = await getTopCreators(limit, nextToken, minRatings);
        
        return formatResponse(200, result);
    } catch (error) {
        console.error('Error fetching top creators:', error);
        return formatResponse(500, { 
            error: 'Internal server error', 
            message: error.message || 'Unknown error' 
        });
    }
};

/**
 * Get top creators sorted by average rating (highest to lowest)
 * Uses a two-phase approach:
 * 1. Scan the table to get all ratings grouped by channelId
 * 2. Calculate average ratings and sort
 * 
 * @param {number} limit - Maximum number of results to return
 * @param {string} nextToken - Pagination token
 * @param {number} minRatings - Minimum number of ratings required for inclusion
 */
async function getTopCreators(limit = 10, nextToken = null, minRatings = DEFAULT_MIN_RATINGS) {
    // Initialize scan parameters
    const scanParams = {
        TableName: TABLE_NAME,
        ProjectionExpression: 'channelId, channelTitle, thumbnailUrl, rating'
    };

    // Add pagination token if provided
    if (nextToken) {
        scanParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
    }
    
    try {
        // Retrieve all ratings from DynamoDB
        const ratingData = await dynamoDB.scan(scanParams).promise();
        
        // Group ratings by channelId and calculate averages
        const channelMap = {};
        
        ratingData.Items.forEach(item => {
            const { channelId, rating, channelTitle, thumbnailUrl } = item;
            
            if (!channelMap[channelId]) {
                channelMap[channelId] = {
                    channelId,
                    channelTitle: channelTitle || '',
                    thumbnailUrl: thumbnailUrl || '',
                    ratings: [],
                    totalRatings: 0
                };
            }
            
            channelMap[channelId].ratings.push(rating);
            channelMap[channelId].totalRatings++;
        });
        
        // Calculate average rating for each channel and filter by minimum ratings threshold
        const topCreators = Object.values(channelMap)
            .filter(channel => channel.totalRatings >= minRatings) // Apply minimum ratings filter
            .map(channel => {
                const totalScore = channel.ratings.reduce((sum, rating) => sum + rating, 0);
                const averageRating = channel.totalRatings > 0 ? totalScore / channel.totalRatings : 0;
                
                return {
                    channelId: channel.channelId,
                    channelTitle: channel.channelTitle,
                    thumbnailUrl: channel.thumbnailUrl,
                    averageRating: parseFloat(averageRating.toFixed(1)),
                    totalRatings: channel.totalRatings
                };
            });
        
        console.log(`Found ${Object.keys(channelMap).length} total channels, ${topCreators.length} meet the minimum ratings threshold of ${minRatings}`);
        
        // Sort by average rating (highest to lowest)
        topCreators.sort((a, b) => b.averageRating - a.averageRating);
        
        // Implement pagination
        const paginatedResults = topCreators.slice(0, limit);
        
        // Format the response
        const response = {
            creators: paginatedResults,
            total: topCreators.length,
            count: paginatedResults.length,
            minRatings: minRatings // Include the minimum ratings threshold used in the response
        };
        
        // Add pagination token if there are more results
        if (ratingData.LastEvaluatedKey) {
            response.nextToken = Buffer.from(JSON.stringify(ratingData.LastEvaluatedKey)).toString('base64');
        }
        
        return response;
    } catch (error) {
        console.error('Error in getTopCreators:', error);
        throw error;
    }
}

/**
 * Get YouTube channel details using YouTube API (optional enhancement)
 */
async function enrichWithChannelDetails(channelIds) {
    // Skip if no API key
    const API_KEY = process.env.YOUTUBE_API_KEY;
    if (!API_KEY || channelIds.length === 0) {
        return {};
    }
    
    try {
        // Call YouTube API to get channel details
        const response = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
            params: {
                part: 'snippet,statistics',
                id: channelIds.join(','),
                key: API_KEY
            }
        });
        
        // Process and return results
        const channelDetails = {};
        if (response.data && response.data.items) {
            response.data.items.forEach(channel => {
                channelDetails[channel.id] = {
                    title: channel.snippet.title,
                    description: channel.snippet.description,
                    thumbnails: channel.snippet.thumbnails,
                    subscriberCount: channel.statistics.subscriberCount,
                    videoCount: channel.statistics.videoCount
                };
            });
        }
        
        return channelDetails;
    } catch (error) {
        console.error('Error fetching channel details:', error);
        return {};
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
            'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'
        },
        body: JSON.stringify(body)
    };
}