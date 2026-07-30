# Remote state backend — reuses the proven cogs S3+KMS+DynamoDB backend, with a
# DISTINCT state key for the fleetworks auth HUB so it never collides with a
# product repo's state (concurrent apply is safe — distinct key => distinct
# DynamoDB lock id). State is a SECRET STORE (SES SMTP password + IAM key + the
# Zitadel OIDC client secret land here); the bucket is SSE-KMS encrypted and
# kms:Decrypt is restricted to named principals.
terraform {
  backend "s3" {
    bucket         = "cogs-tfstate-054772656652-us-east-2"
    key            = "fleetworks/hub/terraform.tfstate"
    region         = "us-east-2"
    dynamodb_table = "cogs-tfstate-lock"
    kms_key_id     = "arn:aws:kms:us-east-2:054772656652:key/d9dea8a1-dad4-4221-8b77-58b20f5835b5"
    encrypt        = true
  }
}
