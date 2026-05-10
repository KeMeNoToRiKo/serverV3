#!/bin/bash

# Move to the directory where this script lives
cd "$(dirname "$0")" || exit 1

read -p "Press Enter to start setup process..."

npm init -y
echo
read -p "npm init complete. Press Enter to continue..."

clear

npm install
echo
read -p "npm install complete. Press Enter to close..."
