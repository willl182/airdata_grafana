FROM mcr.microsoft.com/playwright:v1.59.1-noble AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY webapp/package.json ./webapp/
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build
RUN cd webapp && SKIP_ENV_VALIDATION=1 pnpm run build

FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV API_HOST=127.0.0.1
ENV API_PORT=3001
ENV API_BASE_URL=http://127.0.0.1:3001
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY webapp/package.json ./webapp/
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist
COPY --from=build /app/webapp/.next ./webapp/.next
COPY --from=build /app/webapp/public ./webapp/public
COPY --from=build /app/webapp/next.config.js ./webapp/next.config.js
COPY --from=build /app/webapp/src/env.js ./webapp/src/env.js

RUN mkdir -p data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const http=require('http'); const check=(port,path)=>new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port,path,timeout:3000},res=>{res.resume(); res.statusCode>=200&&res.statusCode<500?resolve():reject(new Error(String(res.statusCode)))}); req.on('error',reject); req.on('timeout',()=>req.destroy(new Error('timeout')))}); Promise.all([check(3001,'/api/health'),check(3000,'/')]).then(()=>process.exit(0),()=>process.exit(1))"

CMD ["sh", "-c", "node dist/scripts/api.js & cd webapp && node node_modules/next/dist/bin/next start"]
