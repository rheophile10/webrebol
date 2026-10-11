# This image runs the 32-bit REBOL View 2.7.8 on a virtual screen.
FROM i386/debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libx11-6 libxext6 libxt6 libxaw7 libxmu6 libstdc++6 libfreetype6 \
    xvfb xauth xfonts-base xfonts-75dpi xfonts-100dpi fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
COPY view-entry.sh /view-entry.sh
WORKDIR /work
ENTRYPOINT ["/view-entry.sh"]
