# Deploy role for deploy-backend.yml. Lives in this stack because it owns the
# functions; the plan/apply roles live in xomware-infrastructure because a
# stack cannot create the roles its own pipeline assumes. Only main can assume it.

locals {
  # Both subject forms: this org emits the numeric one, and the plain form
  # alone fails AssumeRoleWithWebIdentity.
  deploy_subjects = [
    "repo:Xomware/uncle-mikes-pickem",
    "repo:Xomware@263047999/uncle-mikes-pickem@1455587180",
  ]
}

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "deploy_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [for s in local.deploy_subjects : "${s}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "${var.app_name}-github-actions-deploy"
  assume_role_policy = data.aws_iam_policy_document.deploy_trust.json
}

data "aws_iam_policy_document" "deploy_backend" {
  statement {
    sid    = "DeployFunctions"
    effect = "Allow"
    actions = [
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:PublishLayerVersion",
      "lambda:ListLayerVersions",
      "lambda:GetLayerVersion",
    ]
    resources = [
      "arn:aws:lambda:${var.aws_region}:${local.account_id}:function:${var.app_name}-*",
      "arn:aws:lambda:${var.aws_region}:${local.account_id}:layer:${var.app_name}-*",
    ]
  }

  # ListFunctions has no resource-level form; the deploy enumerates pickem-*
  # functions to move them onto a new layer.
  statement {
    sid       = "EnumerateFunctions"
    effect    = "Allow"
    actions   = ["lambda:ListFunctions"]
    resources = ["*"]
  }

  # replay-load.yml runs the loader on demand.
  statement {
    sid       = "RunReplayLoad"
    effect    = "Allow"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.replay_load.arn]
  }
}

resource "aws_iam_role_policy" "deploy_backend" {
  name   = "deploy-backend"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy_backend.json
}

# deploy-frontend.yml's grants, as a second policy so the backend's stay untouched.
data "aws_iam_policy_document" "deploy_frontend" {
  statement {
    sid       = "PublishSite"
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [module.web.s3_bucket_arn, "${module.web.s3_bucket_arn}/*"]
  }

  # ListDistributions has no resource-level form. The workflow uses it to find
  # the distribution by alias; the invalidation itself is scoped below.
  statement {
    sid       = "FindDistribution"
    effect    = "Allow"
    actions   = ["cloudfront:ListDistributions"]
    resources = ["*"]
  }

  statement {
    sid       = "InvalidateCache"
    effect    = "Allow"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [module.web.cloudfront_distribution_arn]
  }

  # The build bakes these into the bundle. xomware-infrastructure owns the Cognito ones.
  statement {
    sid     = "ReadBuildConfig"
    effect  = "Allow"
    actions = ["ssm:GetParameter"]
    resources = concat(
      [for name in ["user-pool-id", "hosted-ui-domain", "clients/pickem-id"] :
      "arn:aws:ssm:${var.aws_region}:${local.account_id}:parameter/xomware/shared/cognito/${name}"],
      [aws_ssm_parameter.api_url.arn],
    )
  }
}

resource "aws_iam_role_policy" "deploy_frontend" {
  name   = "deploy-frontend"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy_frontend.json
}

output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}
