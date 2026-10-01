/**
 * github-deploy-stack.mjs
 * Lets the deploy-aws GitHub Actions workflow deploy without long-lived AWS
 * keys: GitHub's OIDC token is exchanged for a short-lived session on
 * `sentinel-github-deploy`. That role can do exactly one thing — assume the
 * CDK bootstrap roles (`cdk bootstrap` creates them), which carry the real
 * CloudFormation/asset-publishing permissions. It can't touch anything
 * directly, and only jobs running in the repo's `aws-production` GitHub
 * environment (which can require reviewers) can assume it.
 */

import { Stack, CfnOutput, Duration } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';

const GITHUB_OIDC_HOST = 'token.actions.githubusercontent.com';

export class GithubDeployStack extends Stack {
  /**
   * @param {import('constructs').Construct} scope
   * @param {string} id
   * @param {import('aws-cdk-lib').StackProps & { githubRepo: string, existingOidcProviderArn?: string }} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);
    const { githubRepo, existingOidcProviderArn } = props;

    // An account holds one provider per URL; reuse it if another project
    // already created one.
    const provider = existingOidcProviderArn
      ? iam.OidcProviderNative.fromOidcProviderArn(this, 'GithubOidc', existingOidcProviderArn)
      : new iam.OidcProviderNative(this, 'GithubOidc', {
          url: `https://${GITHUB_OIDC_HOST}`,
          clientIds: ['sts.amazonaws.com'],
        });

    const role = new iam.Role(this, 'DeployRole', {
      roleName: 'sentinel-github-deploy',
      description: `CDK deploys from ${githubRepo} (aws-production environment only)`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: {
          [`${GITHUB_OIDC_HOST}:aud`]: 'sts.amazonaws.com',
          [`${GITHUB_OIDC_HOST}:sub`]: `repo:${githubRepo}:environment:aws-production`,
        },
      }),
    });

    role.addToPolicy(new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*-${this.account}-${this.region}`],
    }));

    new CfnOutput(this, 'DeployRoleArn', { value: role.roleArn, description: 'GitHub secret AWS_DEPLOY_ROLE_ARN' });
  }
}
