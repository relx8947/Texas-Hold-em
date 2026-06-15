FROM node:22-alpine AS web-build
WORKDIR /app/web-ui
COPY web-ui/package*.json ./
RUN npm ci
COPY web-ui/ ./
RUN npm run build

FROM golang:1.25-alpine AS server-build
WORKDIR /app/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
RUN CGO_ENABLED=0 go build -o /out/texas-holdem-lan .

FROM alpine:3.22
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=server-build /out/texas-holdem-lan /app/texas-holdem-lan
COPY --from=web-build /app/web-ui/dist /app/web
RUN mkdir -p /data && chown -R app:app /data /app
USER app
ENV ADDR=:8080
ENV DATA_PATH=/data/data.db
ENV STATIC_DIR=/app/web
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["/app/texas-holdem-lan"]
