# Terraform applies the stub once; deploy-backend.yml owns the layer after that.
resource "aws_lambda_layer_version" "lambda_layer" {
  layer_name          = "${var.app_name}-shared-packages"
  filename            = "./templates/lambda_stub.zip"
  compatible_runtimes = [var.lambda_runtime]
  description         = "Shared code and dependencies for ${var.app_name}"

  lifecycle {
    ignore_changes = [filename, source_code_hash, compatible_runtimes, description]
  }
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}
