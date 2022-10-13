import * as cdk from 'aws-cdk-lib';
import { CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DbStack } from './nested-stacks/db-stack';
import { Ec2Stack } from './nested-stacks/ec2-stack';
import { NetworkStack } from './nested-stacks/network-stack';
import { SecretsStack } from './nested-stacks/secrets-stack';

export class MainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const envName = this.node.tryGetContext("env-name");
    const appName = this.node.tryGetContext("app-name");

    const networkStack = new NetworkStack(this, "network-stack", {
      envName,
      appName,
      description: "Creates networks, subnets, security groups, gateways, route tables."
    });

    const secretsStack = new SecretsStack(this, "secrets-stack", {
      envName,
      appName,
      description: "Creates secrets for sensitive credentials."
    });

    const dbStack = new DbStack(this, "db-stack", {
      envName,
      appName,
      dbSecret: secretsStack.getDbSecret(),
      dbSecurityGroup: networkStack.getDbSecurityGroup(),
      dbSubnetGroup: networkStack.getDbSubnetGroup(),
      subnets: networkStack.getSubnets(),
      vpc: networkStack.getVpc(),
      description: "Creates RDS clusters."
    });

    const ec2Stack = new Ec2Stack(this, "ec2-stack", {
      envName,
      appName,
      subnets: networkStack.getSubnets(),
      vpc: networkStack.getVpc(),
      bastionHostSecurityGroup: networkStack.getBastionHostSecurityGroup(),
      description: "Creates EC2 instances."
    });

    ec2Stack.getBastionHosts().forEach(({ instanceAvailabilityZone: az, instancePublicIp: ip }) => {
      new CfnOutput(this, `${az}-ssh-port-forwarding-command`, {
        exportName: `${az}-ssh-port-forwarding-command`,
        value: `ssh -i keypair.pem -N -L 5432:${dbStack.getDbCluster().clusterEndpoint}:5432 ec2-user@${ip}`
      });
    });
  }
}
