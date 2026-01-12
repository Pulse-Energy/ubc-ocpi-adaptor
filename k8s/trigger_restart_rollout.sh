#!/bin/bash

# Check if the deployment name is provided as an argument
if [ -z "$1" ]; then
    echo "Usage: ./start-restart-rollout.sh <deployment-name>"
    exit 1
fi

# Assign the argument to a variable
DEPLOYMENT_NAME=$1

# Ask for confirmation
echo -e "\n🤨 Are you sure you want to restart the rollout for deployment? \n\n$DEPLOYMENT_NAME\n"
read -p "(yes/no): " CONFIRMATION

# Convert confirmation input to lowercase
CONFIRMATION=$(echo "$CONFIRMATION" | tr '[:upper:]' '[:lower:]')

# Proceed based on the confirmation
if [[ "$CONFIRMATION" == "yes" || "$CONFIRMATION" == "y" ]]; then
    # Restart the deployment
    echo -e "\n🔄 Restarting rollout for deployment: $DEPLOYMENT_NAME\n"
    kubectl rollout restart deployment.apps/"$DEPLOYMENT_NAME"

    # Check if the command was successful
    if [ $? -eq 0 ]; then
        echo -e "\n✅ Rollout restart initiated for deployment: $DEPLOYMENT_NAME\n"
    else
        echo -e "\n🔴 Failed to restart rollout for deployment: $DEPLOYMENT_NAME\n"
        exit 1
    fi
else
    echo -e "\n🟡 Operation canceled. Rollout restart for deployment $DEPLOYMENT_NAME was not initiated\n"
    exit 0
fi