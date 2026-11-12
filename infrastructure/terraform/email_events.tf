# pickem-email-events takes SES bounce and complaint notifications off the
# mail-events topic and records the address as suppressed in pickem-ops
# (common/suppression.py), so the mailer skips it before claiming.

locals {
  email_events_name = "${var.app_name}-email-events"
}

resource "aws_cloudwatch_log_group" "email_events" {
  name              = "/aws/lambda/${local.email_events_name}"
  retention_in_days = 30
}

resource "aws_iam_role" "email_events" {
  name               = "${local.email_events_name}-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "email_events" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.email_events.arn}:*"]
  }

  statement {
    sid       = "Suppress"
    actions   = ["dynamodb:PutItem"]
    resources = [aws_dynamodb_table.ops.arn]
  }
}

resource "aws_iam_role_policy" "email_events" {
  name   = "email-events"
  role   = aws_iam_role.email_events.id
  policy = data.aws_iam_policy_document.email_events.json
}

resource "aws_lambda_function" "email_events" {
  # Folder lambdas/email_events.
  function_name = local.email_events_name
  role          = aws_iam_role.email_events.arn
  handler       = "handler.handler"
  runtime       = var.lambda_runtime
  memory_size   = 256
  timeout       = 30
  layers        = [aws_lambda_layer_version.lambda_layer.arn]

  filename         = "./templates/lambda_stub.zip"
  source_code_hash = filebase64sha256("./templates/lambda_stub.zip")

  environment {
    variables = {
      OPS_TABLE = aws_dynamodb_table.ops.id
    }
  }

  depends_on = [aws_cloudwatch_log_group.email_events]

  # Code ownership belongs to CI after the first apply.
  lifecycle {
    ignore_changes = [description, filename, source_code_hash, layers]
  }
}

resource "aws_lambda_permission" "email_events_sns" {
  statement_id  = "AllowMailEventsTopic"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.email_events.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.mail_events.arn
}

resource "aws_sns_topic_subscription" "email_events" {
  topic_arn = aws_sns_topic.mail_events.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.email_events.arn
}
