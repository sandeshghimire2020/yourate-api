const pulumi = require('@pulumi/pulumi');
const aws = require('@pulumi/aws');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from .env file
try {
    const envConfig = dotenv.parse(fs.readFileSync('.env'));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
    console.log('Environment variables loaded from .env file');
} catch (error) {
    console.log('No .env file found or error loading it. Using existing env variables.');
}

// Create an AWS resource group
const lambdaRole = new aws.iam.Role('youtubeSearchLambdaRole', {
    assumeRolePolicy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
                Service: 'lambda.amazonaws.com',
            },
        }],
    }),
});

// Attach the AWS Lambda basic execution role policy
const lambdaPolicyAttachment = new aws.iam.RolePolicyAttachment('lambdaPolicyAttachment', {
    role: lambdaRole.name,
    policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
});

// Create a DynamoDB table for storing YouTube creator ratings and comments
const creatorRatingsTable = new aws.dynamodb.Table('creatorRatingsTable', {
    attributes: [
        { name: 'channelId', type: 'S' },       // Primary key (YouTube channel ID)
        { name: 'timestamp', type: 'S' },       // Sort key for comments (ISO timestamp)
    ],
    hashKey: 'channelId',
    rangeKey: 'timestamp',
    billingMode: 'PAY_PER_REQUEST',  // On-demand capacity for cost efficiency
    pointInTimeRecovery: {
        enabled: true,
    },
    tags: {
        Environment: 'production',
        Name: 'YouTubeCreatorRatings',
    },
});

// Add DynamoDB permissions to Lambda role
const dynamoDBPolicy = new aws.iam.Policy('dynamoDBAccessPolicy', {
    policy: creatorRatingsTable.arn.apply(arn => JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
            Action: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:Query',
                'dynamodb:Scan',
            ],
            Resource: [
                arn,                  // Table permissions
                `${arn}/index/*`,     // For any future indexes
            ],
            Effect: 'Allow',
        }],
    })),
});

const rolePolicyAttachment = new aws.iam.RolePolicyAttachment('lambdaDynamoDBPolicyAttachment', {
    role: lambdaRole.name,
    policyArn: dynamoDBPolicy.arn,
});

// Create Lambda function for YouTube Search
const youtubeSearchFunction = new aws.lambda.Function('youtubeSearchFunction', {
    code: new pulumi.asset.FileArchive('./dist/lambda-package.zip'),
    role: lambdaRole.arn,
    handler: 'youtubeSearchHandler.handler',
    runtime: 'nodejs18.x',
    timeout: 30,
    memorySize: 256,
    environment: {
        variables: {
            RATINGS_TABLE_NAME: creatorRatingsTable.name,
            YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || '',
        },
    },
});

// Create Lambda function for ratings
const ratingsLambdaFunction = new aws.lambda.Function('ratingsFunction', {
    code: new pulumi.asset.FileArchive('./dist/lambda-package.zip'),
    role: lambdaRole.arn,
    handler: 'ratings.handler',
    runtime: 'nodejs18.x',
    timeout: 30,
    memorySize: 256,
    environment: {
        variables: {
            RATINGS_TABLE_NAME: creatorRatingsTable.name,
        },
    },
});

// Create Lambda function for creator profile details
const creatorProfileFunction = new aws.lambda.Function('creatorProfileFunction', {
    code: new pulumi.asset.FileArchive('./dist/lambda-package.zip'),
    role: lambdaRole.arn,
    handler: 'creatorProfile.handler',
    runtime: 'nodejs18.x',
    timeout: 30,
    memorySize: 256,
    environment: {
        variables: {
            RATINGS_TABLE_NAME: creatorRatingsTable.name,
            YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || '',
        },
    },
});

// Create Lambda function for top creators sorted by rating
const topCreatorsFunction = new aws.lambda.Function('topCreatorsFunction', {
    code: new pulumi.asset.FileArchive('./dist/lambda-package.zip'),
    role: lambdaRole.arn,
    handler: 'topCreators.handler',
    runtime: 'nodejs18.x',
    timeout: 30,
    memorySize: 256,
    environment: {
        variables: {
            RATINGS_TABLE_NAME: creatorRatingsTable.name,
            YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || '',
        },
    },
});

// Create Lambda function for recent ratings
const recentRatingsFunction = new aws.lambda.Function('recentRatingsFunction', {
    code: new pulumi.asset.FileArchive('./dist/lambda-package.zip'),
    role: lambdaRole.arn,
    handler: 'recentRatings.handler',
    runtime: 'nodejs18.x',
    timeout: 30,
    memorySize: 256,
    environment: {
        variables: {
            RATINGS_TABLE_NAME: creatorRatingsTable.name,
        },
    },
});

// Create API Gateway for all endpoints
const api = new aws.apigateway.RestApi('youtubeApi', {
    description: 'YouTube Creator API',
    // Enable CORS for the entire API
    endpointConfiguration: {
        types: "REGIONAL"
    }
});

// Create resources for each endpoint
const searchResource = new aws.apigateway.Resource('searchResource', {
    restApi: api.id,
    parentId: api.rootResourceId,
    pathPart: 'search',
});

const ratingsResource = new aws.apigateway.Resource('ratingsResource', {
    restApi: api.id,
    parentId: api.rootResourceId,
    pathPart: 'ratings',
});

const profileResource = new aws.apigateway.Resource('profileResource', {
    restApi: api.id,
    parentId: api.rootResourceId,
    pathPart: 'profile',
});

// Create resource for top creators endpoint
const topCreatorsResource = new aws.apigateway.Resource('topCreatorsResource', {
    restApi: api.id,
    parentId: api.rootResourceId,
    pathPart: 'top-creators',
});

// Create resource for recent ratings endpoint
const recentRatingsResource = new aws.apigateway.Resource('recentRatingsResource', {
    restApi: api.id,
    parentId: api.rootResourceId,
    pathPart: 'recent-ratings',
});

// Create methods for each endpoint
const searchMethod = new aws.apigateway.Method('searchMethod', {
    restApi: api.id,
    resourceId: searchResource.id,
    httpMethod: 'GET',
    authorization: 'NONE',
});

const getRatingsMethod = new aws.apigateway.Method('getRatingsMethod', {
    restApi: api.id,
    resourceId: ratingsResource.id,
    httpMethod: 'GET',
    authorization: 'NONE',
});

const postRatingsMethod = new aws.apigateway.Method('postRatingsMethod', {
    restApi: api.id,
    resourceId: ratingsResource.id,
    httpMethod: 'POST',
    authorization: 'NONE',
});

// Add OPTIONS method for ratings to handle CORS preflight requests
const optionsRatingsMethod = new aws.apigateway.Method('optionsRatingsMethod', {
    restApi: api.id,
    resourceId: ratingsResource.id,
    httpMethod: 'OPTIONS',
    authorization: 'NONE',
});

const getProfileMethod = new aws.apigateway.Method('getProfileMethod', {
    restApi: api.id,
    resourceId: profileResource.id,
    httpMethod: 'GET',
    authorization: 'NONE',
});

// Add method for top creators endpoint
const getTopCreatorsMethod = new aws.apigateway.Method('getTopCreatorsMethod', {
    restApi: api.id,
    resourceId: topCreatorsResource.id,
    httpMethod: 'GET',
    authorization: 'NONE',
});

// Add method for recent ratings endpoint
const getRecentRatingsMethod = new aws.apigateway.Method('getRecentRatingsMethod', {
    restApi: api.id,
    resourceId: recentRatingsResource.id,
    httpMethod: 'GET',
    authorization: 'NONE',
});

// Create integrations for each method
const searchIntegration = new aws.apigateway.Integration('searchIntegration', {
    restApi: api.id,
    resourceId: searchResource.id,
    httpMethod: searchMethod.httpMethod,
    integrationHttpMethod: 'POST',
    type: 'AWS_PROXY',
    uri: youtubeSearchFunction.invokeArn,
});

// Add integration for top creators endpoint
const topCreatorsIntegration = new aws.apigateway.Integration('topCreatorsIntegration', {
    restApi: api.id,
    resourceId: topCreatorsResource.id,
    httpMethod: getTopCreatorsMethod.httpMethod,
    integrationHttpMethod: 'POST',
    type: 'AWS_PROXY',
    uri: topCreatorsFunction.invokeArn,
});

// Add integration for recent ratings endpoint
const recentRatingsIntegration = new aws.apigateway.Integration('recentRatingsIntegration', {
    restApi: api.id,
    resourceId: recentRatingsResource.id,
    httpMethod: getRecentRatingsMethod.httpMethod,
    integrationHttpMethod: 'POST',
    type: 'AWS_PROXY',
    uri: recentRatingsFunction.invokeArn,
});

const getRatingsIntegration = new aws.apigateway.Integration('getRatingsIntegration', {
    restApi: api.id,
    resourceId: ratingsResource.id,
    httpMethod: getRatingsMethod.httpMethod,
    integrationHttpMethod: 'POST',
    type: 'AWS_PROXY',
    uri: ratingsLambdaFunction.invokeArn,
});

const postRatingsIntegration = new aws.apigateway.Integration('postRatingsIntegration', {
    restApi: api.id,
    resourceId: ratingsResource.id,
    httpMethod: postRatingsMethod.httpMethod,
    integrationHttpMethod: 'POST',
    type: 'AWS_PROXY',
    uri: ratingsLambdaFunction.invokeArn,
});

const profileIntegration = new aws.apigateway.Integration('profileIntegration', {
    restApi: api.id,
    resourceId: profileResource.id,
    httpMethod: getProfileMethod.httpMethod,
    integrationHttpMethod: 'POST',
    type: 'AWS_PROXY',
    uri: creatorProfileFunction.invokeArn,
});

// Add a mock integration for OPTIONS preflight requests
const optionsRatingsIntegration = new aws.apigateway.Integration('optionsRatingsIntegration', {
    restApi: api.id,
    resourceId: ratingsResource.id,
    httpMethod: optionsRatingsMethod.httpMethod,
    type: 'MOCK',
    requestTemplates: {
        "application/json": '{"statusCode": 200}'
    },
    passthroughBehavior: 'WHEN_NO_MATCH',
});

// Add response for the OPTIONS method with CORS headers
const optionsMethodResponse = new aws.apigateway.MethodResponse('optionsMethodResponse', {
    restApi: api.id,
    resourceId: ratingsResource.id,
    httpMethod: optionsRatingsMethod.httpMethod,
    statusCode: '200',
    responseParameters: {
        'method.response.header.Access-Control-Allow-Headers': true,
        'method.response.header.Access-Control-Allow-Methods': true,
        'method.response.header.Access-Control-Allow-Origin': true,
    },
    responseModels: {
        'application/json': 'Empty'
    }
});

// Add integration response for OPTIONS method with CORS headers
const optionsIntegrationResponse = new aws.apigateway.IntegrationResponse('optionsIntegrationResponse', {
    restApi: api.id,
    resourceId: ratingsResource.id,
    httpMethod: optionsRatingsMethod.httpMethod,
    statusCode: optionsMethodResponse.statusCode,
    responseParameters: {
        'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        'method.response.header.Access-Control-Allow-Methods': "'GET,POST,OPTIONS'",
        'method.response.header.Access-Control-Allow-Origin': "'*'"
    },
    responseTemplates: {
        'application/json': ''
    },
    integrationId: optionsRatingsIntegration.id,
});

// Create Lambda permissions
const searchLambdaPermission = new aws.lambda.Permission('searchLambdaPermission', {
    action: 'lambda:InvokeFunction',
    function: youtubeSearchFunction,
    principal: 'apigateway.amazonaws.com',
    sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
});

const ratingsLambdaPermission = new aws.lambda.Permission('ratingsLambdaPermission', {
    action: 'lambda:InvokeFunction',
    function: ratingsLambdaFunction,
    principal: 'apigateway.amazonaws.com',
    sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
});

const profileLambdaPermission = new aws.lambda.Permission('profileLambdaPermission', {
    action: 'lambda:InvokeFunction',
    function: creatorProfileFunction,
    principal: 'apigateway.amazonaws.com',
    sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
});

// Add Lambda permission for top creators function
const topCreatorsLambdaPermission = new aws.lambda.Permission('topCreatorsLambdaPermission', {
    action: 'lambda:InvokeFunction',
    function: topCreatorsFunction,
    principal: 'apigateway.amazonaws.com',
    sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
});

// Add Lambda permission for recent ratings function
const recentRatingsLambdaPermission = new aws.lambda.Permission('recentRatingsLambdaPermission', {
    action: 'lambda:InvokeFunction',
    function: recentRatingsFunction,
    principal: 'apigateway.amazonaws.com',
    sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
});

// Create API deployment
const deployment = new aws.apigateway.Deployment('apiDeployment', {
    restApi: api.id,
    triggers: {
        redeployment: pulumi.all([
            searchMethod.id,
            searchIntegration.id,
            getRatingsMethod.id,
            getRatingsIntegration.id,
            postRatingsMethod.id,
            postRatingsIntegration.id,
            getProfileMethod.id,
            profileIntegration.id,
            getTopCreatorsMethod.id,
            topCreatorsIntegration.id,
            getRecentRatingsMethod.id,
            recentRatingsIntegration.id,
            optionsRatingsMethod.id,
            optionsRatingsIntegration.id,
            optionsMethodResponse.id,
            optionsIntegrationResponse.id
        ]).apply(ids => ids.join(',')),
    },
}, {
    dependsOn: [
        searchMethod,
        searchIntegration,
        getRatingsMethod,
        getRatingsIntegration,
        postRatingsMethod,
        postRatingsIntegration,
        getProfileMethod,
        profileIntegration,
        getTopCreatorsMethod,
        topCreatorsIntegration,
        getRecentRatingsMethod,
        recentRatingsIntegration,
        optionsRatingsMethod,
        optionsRatingsIntegration,
        optionsMethodResponse,
        optionsIntegrationResponse
    ]
});

// Create API stage
const stage = new aws.apigateway.Stage('apiStage', {
    deployment: deployment.id,
    restApi: api.id,
    stageName: 'v1',
});

// Remove logging settings from MethodSettings since they require CloudWatch Logs role ARN
const ratingsResourceCors = new aws.apigateway.MethodSettings("ratingsResourceCors", {
    restApi: api.id,
    stageName: stage.stageName,
    methodPath: "*/*", // This applies settings to all methods in the stage
    settings: {
        // Remove metricsEnabled, dataTraceEnabled, and loggingLevel
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50
    }
});

// Export the URLs of the API endpoints
exports.searchApiUrl = pulumi.interpolate`${stage.invokeUrl}/search`;
exports.ratingsApiUrl = pulumi.interpolate`${stage.invokeUrl}/ratings`;
exports.profileApiUrl = pulumi.interpolate`${stage.invokeUrl}/profile`;
exports.topCreatorsApiUrl = pulumi.interpolate`${stage.invokeUrl}/top-creators`;
exports.recentRatingsApiUrl = pulumi.interpolate`${stage.invokeUrl}/recent-ratings`;
exports.ratingsTableName = creatorRatingsTable.name;