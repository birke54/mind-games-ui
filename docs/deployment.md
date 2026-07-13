# Deploying the front-end

The app is a static bundle in an S3 bucket, served by the **same CloudFront distribution that fronts
the API**. That is not an aesthetic choice — it is what makes the app same-origin with `/api/*`, and
the entire auth design depends on it (the backend ships no CORS configuration, and its refresh cookie
is `SameSite=Strict; Path=/api/v1`). Serving the front-end from any other hostname breaks login.

```
                        ┌── default behavior ──▶ S3 (this repo's dist/, private, OAC)
viewer ──▶ CloudFront ──┤
           (+ WAF)      └── /api/* behavior ───▶ API Gateway ──▶ VPC Link ──▶ ALB ──▶ ECS
```

The `/api/*` behavior already exists — the backend repo's `docs/aws-deployment.md` §13 sets it up.
What follows is only the **default behavior**, which serves this app.

---

## 1. The bucket

**It already exists**, in `us-west-2`:

```
mind-games-dev-frontend-851725201833-us-west-2-an
```

That name is what `.github/workflows/deploy.yml` syncs to. If you ever replace the bucket, the
workflow's `S3_BUCKET` has to change with it — a deploy pointed at a bucket CloudFront isn't serving
fails silently, in the worst way: green build, no change to the site.

Keep it private. CloudFront reaches it through an Origin Access Control; nothing else should. Leave
S3 Block Public Access **on** — the OAC bucket policy (step 2) is what lets CloudFront in.

Do **not** enable S3 static website hosting. That endpoint is public HTTP and would bypass CloudFront
(and WAF) entirely — the same hole `OriginVerificationFilter` exists to close on the API side. Use the
REST endpoint (`<bucket>.s3.us-west-2.amazonaws.com`) as the origin.

To create one from scratch:

```bash
export AWS_REGION=us-west-2
export BUCKET=<name>

aws s3api create-bucket --bucket $BUCKET --region $AWS_REGION \
  --create-bucket-configuration LocationConstraint=$AWS_REGION

aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

## 2. The default behavior

On the existing distribution, add an origin pointing at the bucket with **Origin access control**,
and let the console attach the generated bucket policy. Then:

| Setting | Value | Why |
|---|---|---|
| Default root object | `index.html` | `/` has to serve something. |
| Viewer protocol policy | Redirect HTTP → HTTPS | The refresh cookie is `Secure`. |
| Allowed methods | GET, HEAD | It's a static bundle. |
| Cache policy | `CachingOptimized` | Safe: the app's own `Cache-Control` headers (set at upload) are what actually govern. |
| Compress objects | Yes | |

**The one that will bite you:** a client-side route like `/play/42` is not an object in the bucket, so
S3 answers 403 and the viewer gets an error page instead of the app. Add **custom error responses**:

| HTTP error code | Response page path | HTTP response code |
|---|---|---|
| 403 | `/index.html` | **200** |
| 404 | `/index.html` | **200** |

Both must return **200**, not the original status — a 403 body with a 403 status still fails, and the
router never boots. This does not affect `/api/*`, which is matched by its own behavior first.

## 3. Caching — the two rules that matter

Set on upload by the workflow, and they are opposites:

- **Hashed assets** (`/assets/index-D4KZB1aQ.js`) → `public,max-age=31536000,immutable`. The filename
  changes whenever the content does, so they can be cached forever.
- **`index.html`, `sw.js`, `manifest.webmanifest`** → `no-cache,no-store,must-revalidate`. These are
  the entry points, and their names never change. Cache `index.html` and a viewer pins to a stale
  bundle and never sees the deploy again — the classic SPA deploy bug.

Assets are uploaded **before** `index.html`, so a viewer can never fetch a new `index.html` that
references assets which have not landed yet.

## 4. The GitHub Actions role

`.github/workflows/deploy.yml` authenticates by OIDC — no long-lived keys — mirroring the backend's
`build-push-ecr.yml`. Create a role, `mind-games-dev-gha-ui`, trusting GitHub's OIDC provider and
scoped to this repository:

```jsonc
// Trust policy — the `sub` condition is what stops any other repo assuming this role.
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::851725201833:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "repo:birke54/mind-games-ui:*" }
    }
  }]
}
```

In the console this is **IAM → Roles → Create role → Web identity**, provider
`token.actions.githubusercontent.com`, audience `sts.amazonaws.com`, organization `birke54`,
repository `mind-games-ui`. Leave **branch blank** — pinning it to `main` here means pull-request
runs cannot assume the role at all.

Attach this permissions policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::mind-games-dev-frontend-851725201833-us-west-2-an" },
    { "Effect": "Allow", "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::mind-games-dev-frontend-851725201833-us-west-2-an/*" },
    { "Effect": "Allow", "Action": "cloudfront:CreateInvalidation", "Resource": "*" }
  ]
}
```

Then put the role's ARN into `deploy.yml` as `role-to-assume`, and set the distribution id as a
repository variable (**Settings → Secrets and variables → Actions → Variables**), since the workflow
reads `vars.CLOUDFRONT_DISTRIBUTION_ID`:

```bash
gh variable set CLOUDFRONT_DISTRIBUTION_ID --body "E1234567890ABC"
```

> Until that role exists, the deploy job fails at *Configure AWS credentials (OIDC)* with
> **"Not authorized to perform sts:AssumeRoleWithWebIdentity"**. That error means no role in the
> account is willing to be assumed by this repo — not that the workflow is wrong. Build and tests
> run before it and will already have passed.

## 5. Verify

```bash
curl -sI https://cortexclash.org/            | grep -i cache-control   # no-cache
curl -sI https://cortexclash.org/assets/….js | grep -i cache-control   # immutable
curl -s  https://cortexclash.org/api/ping                              # {"status":"ok"} — same origin
```

The third is the important one. If `/api/ping` does not answer from the *same hostname* the app is
served from, login cannot work, and no amount of front-end debugging will fix it.

Then load the app, sign in, and reload the page. If you stay signed in, the refresh cookie made the
round trip — which is the real end-to-end proof that the topology is right.
