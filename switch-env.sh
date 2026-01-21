#!/bin/bash

# Helper script to switch between development and production environments
# Usage: ./switch-env.sh [development|production]

ENV=${1:-development}

echo "🔄 Switching to $ENV environment..."

# Kill existing port forwards on standard ports
echo "Stopping existing port forwards..."
pkill -f "port-forward.*30700" 2>/dev/null
pkill -f "port-forward.*30300" 2>/dev/null
sleep 2

if [ "$ENV" = "development" ]; then
    echo "🧪 Setting up DEVELOPMENT environment"
    echo "   Namespace: backstage"
    echo "   Target deployment: development namespace"
    
    # Development port forwards
    kubectl port-forward -n backstage svc/backstage-service 30700:7000 --address=127.0.0.1 > /dev/null 2>&1 &
    kubectl port-forward -n backstage svc/scaffolder-service 30300:3000 --address=127.0.0.1 > /dev/null 2>&1 &
    
elif [ "$ENV" = "production" ]; then
    echo "🚀 Setting up PRODUCTION environment"
    echo "   Namespace: backstage-prod" 
    echo "   Target deployment: stage namespace"
    
    # Production port forwards
    kubectl port-forward -n backstage-prod svc/backstage 30700:7000 --address=127.0.0.1 > /dev/null 2>&1 &
    kubectl port-forward -n backstage-prod svc/scaffolder-service 30300:3000 --address=127.0.0.1 > /dev/null 2>&1 &
    
else
    echo "❌ Invalid environment. Use 'development' or 'production'"
    exit 1
fi

sleep 3

echo "✅ Environment switched to $ENV"
echo ""
echo "🌐 Access points:"
echo "   Backstage UI:       http://localhost:30700"
echo "   Scaffolder Service: http://localhost:30300"
echo ""
echo "🔍 Health check:"
curl -s http://localhost:30700/ > /dev/null && echo "   ✅ Backstage UI: OK" || echo "   ❌ Backstage UI: Failed"
curl -s http://localhost:30300/health > /dev/null && echo "   ✅ Scaffolder Service: OK" || echo "   ❌ Scaffolder Service: Failed"

echo ""
if [ "$ENV" = "development" ]; then
    echo "📍 Services will be deployed to: development namespace"
elif [ "$ENV" = "production" ]; then
    echo "📍 Services will be deployed to: stage namespace"
fi