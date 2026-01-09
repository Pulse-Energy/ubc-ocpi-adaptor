#!/bin/bash

# Get the current active Kubernetes cluster
CLUSTER_NAME=$(kubectl config current-context)

# Ask for confirmation
echo -e "\n🤨 Are you sure you want to apply changes in the following Kubernetes cluster? \n\n$CLUSTER_NAME\n"
read -p "(yes/no): " CONFIRM

# Convert input to lowercase
CONFIRM=$(echo "$CONFIRM" | tr '[:upper:]' '[:lower:]')

# Check user confirmation
if [[ "$CONFIRM" == "yes" || "$CONFIRM" == "y" ]]; then
    echo -e "\n🔄 Applying changes to $CLUSTER_NAME...\n"
    kustomize build --enable-alpha-plugins . | kubectl apply -f -
else
    echo -e "\n🟡 Operation canceled."
    exit 1
fi
