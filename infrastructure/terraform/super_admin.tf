# POST /super/cron starts these four scheduled jobs on demand, and nothing else.
data "aws_iam_policy_document" "super_cron_invoke" {
  statement {
    sid     = "InvokeJobs"
    actions = ["lambda:InvokeFunction"]
    resources = [
      aws_lambda_function.cron_tick.arn,
      aws_lambda_function.capture.arn,
      aws_lambda_function.replay_load.arn,
      aws_lambda_function.mail_sweep.arn,
    ]
  }
}
