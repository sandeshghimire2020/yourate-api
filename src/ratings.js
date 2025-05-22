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

    // Validate email if provided
    if (email) {
        // Basic email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return formatResponse(400, { error: 'Invalid email format' });
        }
        
        console.log(`Validating email domain: ${email}`);
        
        // Extract the domain from the email
        const emailDomain = email.split('@')[1].toLowerCase();
        console.log(`Email domain: ${emailDomain}`);

        // =======================================
        // STRICT WHITELIST-ONLY EMAIL VALIDATION
        // =======================================
        
        // Switch to a strict whitelist-only approach for maximum security
        
        // Explicitly allowed email providers (whitelist approach)
        const validConsumerDomains = [
            'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 
            'aol.com', 'icloud.com', 'protonmail.com', 'proton.me',
            'zoho.com', 'mail.com', 'yandex.com', 'gmx.com', 'gmx.net',
            'fastmail.com', 'tutanota.com', 'tutanota.de', 'live.com', 'msn.com',
            'me.com', 'comcast.net', 'verizon.net', 'att.net', 'mail.ru',
            'web.de', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.co.jp', 'yahoo.com.br',
            'googlemail.com', 'pm.me', 'aim.com', 'outlook.fr', 'outlook.de'
        ];

        // Major company domains
        const majorCompanyDomains = [
            'apple.com', 'google.com', 'microsoft.com', 'amazon.com', 'facebook.com',
            'meta.com', 'ibm.com', 'oracle.com', 'intel.com', 'cisco.com'
        ];
        
        // Educational TLDs
        const validEducationTLDs = ['.edu', '.ac.uk', '.edu.au'];

        // Check if domain is in our allowed list
        const isAllowedConsumerDomain = validConsumerDomains.includes(emailDomain);
        const isAllowedCompanyDomain = majorCompanyDomains.includes(emailDomain);
        const isEducationalDomain = validEducationTLDs.some(tld => emailDomain.endsWith(tld));
        
        // Common fake domain patterns - to block all variations including with numbers
        const fakeDomainPatterns = ['test', 'example', 'fake', 'lol', 'temp'];
        
        // Check if the domain matches any fake domain patterns (including numeric variations)
        for (const pattern of fakeDomainPatterns) {
            // Extract the domain name without the TLD
            const domainWithoutTLD = emailDomain.split('.')[0];
            
            // Check if domain name contains the pattern (with or without numbers)
            if (domainWithoutTLD.includes(pattern) || 
                // Check if domain matches pattern after removing numbers
                domainWithoutTLD.replace(/\d+/g, '') === pattern) {
                console.log(`Blocked fake domain pattern: ${emailDomain} (matched pattern: ${pattern})`);
                return formatResponse(400, { 
                    error: 'Invalid email domain', 
                    message: 'Please use a valid email address from a recognized provider'
                });
            }
        }
        
        // List of explicitly blocked domains and patterns (redundant but kept for extra security)
        const blockedDomains = [
            'lol.com', 'lol2.com', 'lol3.com', 'example.com', 'test.com', 'test1.com',
            'test2.com', 'test3.com', 'test4.com', 'test5.com', 'fake.com', 
            'mailinator.com', 'tempmail.com', 'throwawaymail.com'
        ];
        
        if (blockedDomains.includes(emailDomain)) {
            console.log(`Email domain ${emailDomain} directly matched a blocked domain`);
            return formatResponse(400, { 
                error: 'Invalid email domain', 
                message: 'Please use a valid email address from a recognized provider'
            });
        }

        // Suspicious patterns that might indicate fake email domains
        const suspiciousPatterns = [
            'temp', 'fake', 'trash', 'disposable', 'throwaway',
            'mailinator', 'guerrilla', 'tempmail', '10minute', 'sharklasers'
        ];
        
        // Check for suspicious patterns in the domain
        for (const pattern of suspiciousPatterns) {
            if (emailDomain.includes(pattern)) {
                console.log(`Domain ${emailDomain} contains suspicious pattern: ${pattern}`);
                return formatResponse(400, { 
                    error: 'Invalid email domain', 
                    message: 'Please use a valid email address from a recognized provider'
                });
            }
        }

        // If not on whitelist and not explicitly blocked, reject by default
        if (!isAllowedConsumerDomain && !isAllowedCompanyDomain && !isEducationalDomain) {
            console.log(`Rejecting non-whitelisted domain: ${emailDomain}`);
            return formatResponse(400, { 
                error: 'Email domain not recognized', 
                message: 'Please use a valid email address from a recognized provider like Gmail, Yahoo, Outlook, etc.'
            });
        }
        
        console.log(`Email validation passed for domain: ${emailDomain}`);
    }
    
    // Get IP address from the request (if available)
    const sourceIp = event.requestContext?.identity?.sourceIp || 'unknown';
    
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
    
    // Check for multiple ratings from the same IP address for this specific channel
    // This implements the "2 ratings per device per creator" limit
    try {
        // Check if this IP has submitted multiple ratings for this specific channel
        if (sourceIp !== 'unknown') {
            // We'll enforce a limit of 2 ratings per IP address per creator
            const MAX_RATINGS_PER_IP_PER_CREATOR = 2;
            
            const ipRatingsForChannelParams = {
                TableName: TABLE_NAME,
                KeyConditionExpression: 'channelId = :channelId',
                FilterExpression: 'ipAddress = :ip',
                ExpressionAttributeValues: {
                    ':channelId': channelId,
                    ':ip': sourceIp
                }
            };
            
            const existingRatings = await dynamoDB.query(ipRatingsForChannelParams).promise();
            
            if (existingRatings.Items && existingRatings.Items.length >= MAX_RATINGS_PER_IP_PER_CREATOR) {
                console.warn(`Rating limit exceeded: IP ${sourceIp} has already submitted ${existingRatings.Items.length} ratings for channel ${channelId}`);
                return formatResponse(429, { 
                    error: 'Rating limit reached', 
                    message: `You have reached the maximum number of ratings allowed (${MAX_RATINGS_PER_IP_PER_CREATOR}) for this creator.`
                });
            }
            
            console.log(`IP ${sourceIp} has submitted ${existingRatings.Items?.length || 0} previous ratings for channel ${channelId}`);
        }
    } catch (error) {
        console.error('Error checking for rating limits:', error);
        // Continue processing even if this check fails, to avoid blocking legitimate users
    }
    
    // Prepare item for DynamoDB
    const timestamp = new Date().toISOString();
    const item = {
        channelId,
        timestamp,
        rating,
        comment: comment || '',
        channelTitle: channelTitle || '',
        email: email || '',
        ipAddress: sourceIp, // Store IP address for abuse prevention
        userAgent: event.requestContext?.identity?.userAgent || 'unknown' // Store user agent for additional tracking
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