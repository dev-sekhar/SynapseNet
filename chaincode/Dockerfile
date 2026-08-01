# SynapseNet/chaincode/skill-manager/Dockerfile
# Use a base image with Node.js pre-installed for Hyperledger Fabric chaincode
FROM hyperledger/fabric-nodeenv:latest

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to install dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the TypeScript source code and tsconfig.json, then build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Expose the port (if your chaincode needs to listen, though Fabric shim handles much of this)
# EXPOSE 7052

# Command to run the chaincode.
# The 'start' script in package.json typically handles the fabric-chaincode-node command.
CMD [ "npm", "start" ]