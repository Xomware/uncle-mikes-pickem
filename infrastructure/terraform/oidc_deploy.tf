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
}

resource "aws_iam_role_policy" "deploy_backend" {
  name   = "deploy-backend"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy_backend.json
}

output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}
