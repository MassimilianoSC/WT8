# syntax=docker/dockerfile:1
# ---- PracticeHub: un'unica immagine per app, worker e strumenti operativi (K1, D-156) ----
#
#   app      node server.js                      (Next.js standalone)
#   worker   node ops/worker.mjs                 (job degli alert e recapito delle mail)
#   backup   node ops/backup-service.mjs        (copie notturne con verifica e conservazione)
#            node ops/backup-db.mjs …            (copie, verifica, ripristino a mano)
#   comandi  node ops/outbox-requeue.mjs …, node ops/reset-db.mjs …, node ops/utenti-prova.mjs …,
#            node ops/seed-demo.mjs … (solo stack di prova)
#
# In esercizio non ci sono tsx, TypeScript né devDependencies: gli strumenti sono già compilati (scripts/build-ops.mjs).

FROM node:20.19-alpine AS base
WORKDIR /app

# 1) Dipendenze: solo dal lockfile (nessun ripiego su versioni diverse).
FROM base AS deps
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000

# 2) Build dell'app e degli strumenti operativi
FROM base AS builder
ENV NEXT_OUTPUT_STANDALONE=true
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build && node scripts/build-ops.mjs

# 3) Immagine di esercizio
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Gli orari funzionali sono sempre calcolati su Europe/Rome dal codice; il fuso serve ai registri leggibili.
ENV TZ=Europe/Rome

RUN apk add --no-cache tzdata \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Server standalone + risorse statiche + file pubblici + strumenti operativi.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/dist/ops ./ops

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
