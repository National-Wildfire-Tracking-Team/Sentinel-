#!/bin/sh
# AWS Lambda entry point (Lambda Web Adapter runs this; see infra/aws/README.md).
# A container host ignores it — the Dockerfile CMD starts the same server.
exec node index.mjs
