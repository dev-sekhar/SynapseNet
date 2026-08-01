# SynapseNet/ai-services/skill-matcher/Dockerfile
FROM python:3.10-slim-buster

# Set the working directory for the application
WORKDIR /app

# Copy the requirements file and install dependencies
# This will be refined later when we have actual code.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application source code
COPY src/ ./src/

# Command to run the application (placeholder for now)
CMD ["python", "src/main.py"] # Placeholder for your AI service entry point