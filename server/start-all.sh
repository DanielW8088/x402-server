#!/bin/bash

# Build
npm run build

# Start all services
pm2 start ecosystem.config.cjs

# Show status
pm2 status

# Show logs
pm2 logs

