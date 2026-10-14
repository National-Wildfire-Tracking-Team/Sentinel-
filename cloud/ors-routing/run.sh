#!/bin/sh
# AWS Lambda entry point (Lambda Web Adapter runs this; see infra/aws/README.md).
# The deployed asset is the esbuild bundle (index.mjs) — see the `bundle`
# option in infra/aws/lib/services.mjs.
exec node index.mjs
