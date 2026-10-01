#!/bin/sh
# AWS Lambda entry point (the Lambda Web Adapter runs this; see infra/aws/README.md).
# Locally: python3 app.py (PORT defaults to 8080).
cd "$(dirname "$0")" || exit 1
exec python3 app.py
