#!/bin/sh

set -ex
npx prisma migrate deploy
npm run build
