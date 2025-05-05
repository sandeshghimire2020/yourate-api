# YouRate - YouTube Creator Rating Backend

A serverless backend for rating and reviewing YouTube creators, built with AWS Lambda, API Gateway, and DynamoDB, deployed using Pulumi.

## Features

- **YouTube Creator Search**: Search for YouTube creators by name and get their ratings
- **Ratings & Comments**: Add and retrieve ratings and comments for YouTube creators
- **Creator Profiles**: Get detailed information about a creator including their YouTube stats and community ratings
- **Email Verification**: Prevent duplicate ratings from the same user for a channel
- **Cross-Origin Support**: Full CORS support for frontend integration
- **Pagination Support**: Handle large amounts of ratings with efficient pagination
- **Serverless Architecture**: Fully serverless backend that scales automatically

## API Endpoints

### Search for YouTube Creators
- **Endpoint**: `GET /search`
- **Parameters**: 
  - `q` (required): Search query
  - `maxResults` (optional): Maximum number of results to return (default: 5)
- **Example Request**: 
  ```
  GET https://x22ulkpal2.execute-api.us-east-1.amazonaws.com/v1/search?q=mrbeast&maxResults=5
  ```
- **Response**: YouTube search results enriched with ratings data (if available)

### Get or Add Ratings
- **Endpoint**: `GET /ratings` or `POST /ratings`
- **GET Parameters**:
  - `channelId` (required): YouTube channel ID
- **Example GET Request**: 
  ```
  GET https://x22ulkpal2.execute-api.us-east-1.amazonaws.com/v1/ratings?channelId=UCX6OQ3DkcsbYNE6H8uQQuVA
  ```
- **POST Body**:
  ```json
  {
    "channelId": "UCX6OQ3DkcsbYNE6H8uQQuVA",
    "channelTitle": "MrBeast",
    "rating": 5,
    "comment": "Great content, very entertaining!",
    "email": "user@example.com"
  }
  ```
- **Response**: Ratings and comments for the specified channel
- **Note**: The email field is used to prevent duplicate ratings from the same user for a specific channel

### Get Creator Profile
- **Endpoint**: `GET /profile`
- **Parameters**:
  - `channelId` (required): YouTube channel ID
  - `limit` (optional): Maximum number of comments to return (default: 20)
  - `nextToken` (optional): Pagination token for additional results
- **Example Request**: 
  ```
  GET https://x22ulkpal2.execute-api.us-east-1.amazonaws.com/v1/profile?channelId=UCX6OQ3DkcsbYNE6H8uQQuVA&limit=3
  ```
- **Response**: Combined YouTube channel data and community ratings/comments

## Architecture

### AWS Services

- **Lambda**: Serverless functions for handling API requests
- **API Gateway**: RESTful API endpoints with CORS support
- **DynamoDB**: NoSQL database for storing ratings and comments
- **CloudWatch**: Monitoring and logging

### Project Structure

- `src/`: Source code for Lambda functions
  - `youtubeSearchHandler.js`: YouTube search functionality
  - `ratings.js`: Ratings management with email verification
  - `creatorProfile.js`: Creator profile integration
- `dist/`: Distribution code deployed to Lambda
- `index.js`: Pulumi infrastructure definition
- `checkLogs.js`: Utility for checking CloudWatch logs

## Setup and Deployment

### Prerequisites

- Node.js (v14+)
- AWS CLI configured
- Pulumi CLI installed
- YouTube Data API key

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/yourate-webapp.git
   cd yourate-webapp
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a distribution directory:
   ```
   mkdir -p dist
   cp src/* dist/
   cd dist && npm install axios
   cd ..
   ```

4. Update the YouTube API key in the source files (or use environment variables)

5. Deploy using Pulumi:
   ```
   pulumi up
   ```

6. Note the API endpoints from the Pulumi output:
   ```
   searchApiUrl    : "https://x22ulkpal2.execute-api.us-east-1.amazonaws.com/v1/search"
   ratingsApiUrl   : "https://x22ulkpal2.execute-api.us-east-1.amazonaws.com/v1/ratings"
   profileApiUrl   : "https://x22ulkpal2.execute-api.us-east-1.amazonaws.com/v1/profile"
   ```

## Development

### Local Testing

For testing Lambda functions locally:

```js
const event = { 
  queryStringParameters: { 
    q: 'mrbeast',
    maxResults: 5
  }
};

const result = await handler(event);
console.log(JSON.stringify(result, null, 2));
```

### Testing POST Requests

For testing POST requests to the ratings endpoint:

```bash
curl -X POST \
  https://x22ulkpal2.execute-api.us-east-1.amazonaws.com/v1/ratings \
  -H 'Content-Type: application/json' \
  -d '{
    "channelId": "UCX6OQ3DkcsbYNE6H8uQQuVA",
    "channelTitle": "MrBeast",
    "rating": 4,
    "comment": "Amazing quality videos",
    "email": "test@example.com"
  }'
```

### Debugging

Use the included `checkLogs.js` script to view CloudWatch logs:

```
node checkLogs.js
```

### Deployment Script

```
npm run deploy
```

## CORS Support

The API includes comprehensive CORS support to enable cross-origin requests from web applications:
- All endpoints support OPTIONS preflight requests
- Headers include proper Access-Control-Allow-* configurations
- API Gateway is configured with REGIONAL endpoint type
- Lambda responses include CORS headers for consistent behavior

## Future Improvements

- Add authentication for rating submissions
- Implement rate limiting to prevent abuse
- Add caching for frequently accessed creators
- Create a frontend web application
- Add trending creators based on ratings
- Implement email verification via one-time links

## License

MIT

---

Updated: May 5, 2025
Built with ❤️ using AWS Serverless and Pulumi