#!/bin/bash
export NODE_ENV=${NODE_ENV:-'production'}
echo "Building in ${NODE_ENV} mode..."
pnpm build

echo "Starting the application..."
pnpm start
