# Builder stage: install the exact pinned wgrib2 build from conda-forge,
# matching the version+build string previously pinned in the GitHub Actions
# workflow (mamba-org/setup-micromamba) so GRIB2 decoding behavior can't
# silently drift. Kept in its own stage so the final image doesn't carry the
# conda/micromamba toolchain itself, only the resulting environment.
FROM mambaorg/micromamba:1.5.8 AS wgrib2-builder
RUN micromamba create -y -n mrms-decode -c conda-forge wgrib2=3.8.0=h021f410_7 \
    && micromamba clean --all --yes

FROM node:24-slim

# Copy just the built conda environment (binary + its shared library deps),
# not the conda/micromamba tooling used to build it.
COPY --from=wgrib2-builder /opt/conda/envs/mrms-decode /opt/wgrib2
ENV WGRIB2_BIN=/opt/wgrib2/bin/wgrib2
ENV LD_LIBRARY_PATH=/opt/wgrib2/lib

WORKDIR /app
COPY sync.mjs mrmsPayloadFormat.js ./

CMD ["node", "sync.mjs"]
