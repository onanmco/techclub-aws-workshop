import * as cdk from 'aws-cdk-lib';
import { CfnOutput } from 'aws-cdk-lib';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { DbStack } from './nested-stacks/db-stack';
import { Ec2Stack } from './nested-stacks/ec2-stack';
import { NetworkStack } from './nested-stacks/network-stack';

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

    const dbStack = new DbStack(this, "db-stack", {
      envName,
      appName,
      dbSecurityGroup: networkStack.getDbSecurityGroup(),
      vpc: networkStack.getVpc(),
      description: "Creates RDS clusters."
    });

    const ec2Stack = new Ec2Stack(this, "ec2-stack", {
      envName,
      appName,
      vpc: networkStack.getVpc(),
      bastionHostSecurityGroup: networkStack.getBastionHostSecurityGroup(),
      description: "Creates EC2 instances."
    });

    new CfnOutput(this, "ssh-port-forwarding-command", {
      exportName: "ssh-port-forwarding-command",
      value: `ssh -i keypair.pem -N -L 5432:${dbStack.getDbCluster().clusterEndpoint}:5432 ec2-user@${ec2Stack.getBastionHost().instancePublicIp}`
    });

    new CfnOutput(this, "private-key", {
      exportName: "private-key",
      value: StringParameter.valueFromLookup(this, ec2Stack.getKeypair().keyName)
    });
  }
}
