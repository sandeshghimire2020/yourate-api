# YouRate API

A serverless API for searching, rating, and viewing YouTube creators built with AWS Lambda, API Gateway, and DynamoDB.

## Overview

YouRate API allows users to:
- Search for YouTube channels/creators
- View detailed information about YouTube creators
- Submit and retrieve ratings and comments for YouTube creators
- Get a sorted list of top-rated creators with pagination support

The application is built using serverless architecture on AWS with infrastructure as code using Pulumi.

## Tech Stack

- **Backend**: AWS Lambda (Node.js 18.x)
- **API**: AWS API Gateway
- **Database**: AWS DynamoDB
- **Infrastructure**: Pulumi (Infrastructure as Code)
- **Language**: JavaScript
- **Dependencies**: axios, aws-sdk, dotenv

## Setup Instructions

### Prerequisites

- Node.js 16.x or higher
- AWS account and configured AWS CLI credentials
- Pulumi CLI installed
- YouTube Data API key

### Environment Setup

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/yourate-api.git
   cd yourate-api
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file based on the sample:
   ```
   cp .env.sample .env
   ```

4. Update the `.env` file with your YouTube API key:
   ```
   # YouTube API Credentials
   YOUTUBE_API_KEY=your_youtube_api_key_here

   # AWS Configuration
   AWS_REGION=us-east-1
   RATINGS_TABLE_NAME=creatorRatings

   # Other Configuration
   API_STAGE_NAME=v1
   ```

### Deployment

1. Build the Lambda package with dependencies:
   ```
   npm run build
   ```

2. Deploy the infrastructure:
   ```
   npm run deploy
   ```

3. After deployment, Pulumi will output the API endpoints.

## API Endpoints

The API provides the following endpoints:

### Search YouTube Creators
- **Endpoint**: `/search`
- **Method**: GET
- **Parameters**:
  - `q`: (required) Search query term
  - `maxResults`: (optional) Number of results to return (default: 5)
- **Example**: `GET /search?q=tech&maxResults=10`

### Get Creator Profile
- **Endpoint**: `/profile`
- **Method**: GET
- **Parameters**:
  - `channelId`: (required) YouTube channel ID
- **Example**: `GET /profile?channelId=UC_x5XG1OV2P6uZZ5FSM9Ttw`

### Get Ratings
- **Endpoint**: `/ratings`
- **Method**: GET
- **Parameters**:
  - `channelId`: (required) YouTube channel ID
  - `limit`: (optional) Number of ratings to return
  - `nextToken`: (optional) Pagination token
- **Example**: `GET /ratings?channelId=UC_x5XG1OV2P6uZZ5FSM9Ttw&limit=20`

### Submit Rating
- **Endpoint**: `/ratings`
- **Method**: POST
- **Body**:
  ```json
  {
    "channelId": "UC_x5XG1OV2P6uZZ5FSM9Ttw",
    "rating": 5,
    "comment": "Great educational content!",
    "channelTitle": "Google Developers",
    "thumbnailUrl": "https://yt3.googleusercontent.com/example.jpg",
    "description": "The official YouTube channel for Google Developers",
    "profilePicture": {
      "default": "https://yt3.googleusercontent.com/default.jpg",
      "medium": "https://yt3.googleusercontent.com/medium.jpg",
      "high": "https://yt3.googleusercontent.com/high.jpg"
    }
  }
  ```
- **Required fields**: channelId, rating (1-5)
- **Optional fields**: comment, channelTitle, thumbnailUrl, description, profilePicture

### Get Top Creators
- **Endpoint**: `/top-creators`
- **Method**: GET
- **Parameters**:
  - `limit`: (optional) Number of results to return (default: 10)
  - `nextToken`: (optional) Pagination token for retrieving next set of results
  - `minRatings`: (optional) Minimum number of ratings required (default: 1)
- **Example**: `GET /top-creators?limit=20&minRatings=5`
- **Response**:
  ```json
  {
    "creators": [
      {
        "channelId": "UC_x5XG1OV2P6uZZ5FSM9Ttw",
        "channelTitle": "Google Developers",
        "thumbnailUrl": "https://yt3.googleusercontent.com/example.jpg",
        "description": "The official YouTube channel for Google Developers...",
        "profilePicture": {
          "default": "https://yt3.googleusercontent.com/default.jpg",
          "medium": "https://yt3.googleusercontent.com/medium.jpg",
          "high": "https://yt3.googleusercontent.com/high.jpg"
        },
        "averageRating": 4.9,
        "totalRatings": 25
      }
    ],
    "total": 50,
    "count": 1,
    "minRatings": 5,
    "nextToken": "eyJjaGFubmVsSWQiOiJVQzEyMzQ1Njc4OSJ9..."
  }
  ```

## Pagination

For endpoints that return potentially large result sets (`/top-creators` and `/ratings`), pagination is implemented using the following pattern:

1. Make an initial request without a `nextToken`
2. If more results are available, the response will contain a `nextToken` field
3. Use this token in a subsequent request to retrieve the next set of results
4. Continue until no `nextToken` is returned, indicating you've reached the end of the results

Example paginated requests:
```
GET /top-creators?limit=10
GET /top-creators?limit=10&nextToken=eyJjaGFubmVsSWQiOiJVQzEyMzQ1Njc4OSJ9...
```

## Development

### Project Structure

- **src/**: Contains Lambda function handlers
  - `youtubeSearchHandler.js`: Handles YouTube channel search requests
  - `creatorProfile.js`: Handles creator profile data requests
  - `ratings.js`: Handles rating submissions and retrievals
  - `topCreators.js`: Handles requests for top-rated creators
- **build.js**: Script to bundle Lambda functions with dependencies
- **index.js**: Pulumi infrastructure code
- **.env**: Environment variables (not committed to repo)

### Local Development

For local testing of Lambda functions, you can use the AWS SAM CLI or directly invoke functions using the AWS CLI.

Example using AWS CLI:
```
aws lambda invoke --function-name youtubeSearchFunction --payload '{"queryStringParameters":{"q":"tech"}}' output.json
```

### Creator Media Storage

The API now supports storing and retrieving creator metadata:

- **Thumbnails**: Store channel thumbnail URLs when submitting ratings
- **Profile Pictures**: Store profile pictures at various resolutions
- **Descriptions**: Store channel descriptions for display in UI

This allows the `/top-creators` endpoint to return rich media without requiring additional API calls.

## Troubleshooting

Common issues:

1. **502 Gateway Errors**: Usually caused by Lambda execution errors. Check CloudWatch logs.

2. **Missing Dependencies**: Ensure build process correctly bundles dependencies like axios:
   ```
   npm run build
   ```

3. **API Key Issues**: Verify your YouTube API key is correct and has proper permissions.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.