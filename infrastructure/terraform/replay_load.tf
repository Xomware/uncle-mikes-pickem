# pickem-replay-load builds the 2026 replay rows in pickem-nfl from nflverse
# and the capture archive (F5.2). Invoked by hand from replay-load.yml.

locals {
  replay_load_name = "${var.app_name}-replay-load"
}

resource "aws_cloudwatch_log_group" "replay_load" {
  name              = "/aws/lambda/${local.replay_load_name}"
  retention_in_days = 30
}

resource "aws_iam_role" "replay_load" {
  name               = "${local.replay_load_name}-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "replay_load" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.replay_load.arn}:*"]
  }

  # Writes REPLAY# rows only; batch_writer sends BatchWriteItem of puts.
  statement {
    sid       = "WriteReplayRows"
    actions   = ["dynamodb:BatchWriteItem", "dynamodb:PutItem"]
    resources = [aws_dynamodb_table.nfl.arn]
    condition {
      test     = "ForAllValues:StringLike"
      variable = "dynamodb:LeadingKeys"
      values   = ["REPLAY#*"]
    }
  }

  statement {
    sid       = "ListCaptures"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.capture.arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["raw/*"]
    }
  }

  statement {
    sid       = "ReadCaptures"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.capture.arn}/raw/*"]
  }
}

resource "aws_iam_role_policy" "replay_load" {
  name   = "replay-load"
  role   = aws_iam_role.replay_load.id
  policy = data.aws_iam_policy_document.replay_load.json
}

resource "aws_lambda_function" "replay_load" {
  # Folder lambdas/replay_load.
  function_name = local.replay_load_name
  role          = aws_iam_role.replay_load.arn
  handler       = "handler.handler"
  runtime       = var.lambda_runtime
  memory_size   = 512
  timeout       = 300
  layers        = [aws_lambda_layer_version.lambda_layer.arn]

  filename         = "./templates/lambda_stub.zip"
  source_code_hash = filebase64sha256("./templates/lambda_stub.zip")

  environment {
    variables = {
      NFL_TABLE      = aws_dynamodb_table.nfl.id
      CAPTURE_BUCKET = aws_s3_bucket.capture.id
    }
  }

  depends_on = [aws_cloudwatch_log_group.replay_load]

  # Code ownership belongs to CI after the first apply.
  lifecycle {
    ignore_changes = [description, filename, source_code_hash, layers]
  }
}
