#!/bin/bash

# Test IM webhook endpoint

curl -X POST http://localhost:3000/api/im/message \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "message": "Hello, can you help me?",
    "callback_url": "https://webhook.site/unique-id"
  }'
