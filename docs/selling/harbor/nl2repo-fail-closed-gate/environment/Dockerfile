FROM python:3.12-slim
WORKDIR /workspace
RUN pip install --no-cache-dir pytest==8.3.3
COPY spec.md /workspace/SPEC.md
# The agent starts with a spec and an empty tree. No golden source here.
