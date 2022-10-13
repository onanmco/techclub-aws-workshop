import { Duration, NestedStack, NestedStackProps } from "aws-cdk-lib";
import { ISecurityGroup, ISubnet, IVpc } from "aws-cdk-lib/aws-ec2";
import { AuroraCapacityUnit, Credentials, DatabaseClusterEngine, ISubnetGroup, ServerlessCluster } from "aws-cdk-lib/aws-rds";
import { ISecret, SecretTargetAttachment } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

interface DbStackProps extends NestedStackProps {
  envName: string;
  appName: string;
  vpc: IVpc,
  subnets: { [key: string]: ISubnet };
  dbSubnetGroup: ISubnetGroup;
  dbSecurityGroup: ISecurityGroup;
  dbSecret: ISecret;
}

export class DbStack extends NestedStack {
  private readonly dbCluster: ServerlessCluster;

  public getDbCluster() {
    return this.dbCluster;
  }

  constructor(scope: Construct, id: string, props: DbStackProps) {
    super(scope, id, props);

    const { envName, appName } = props;

    const dbSubnets = Object.keys(props.subnets)
      .filter(v => v.includes("db"))
      .map(v => props.subnets[v]);

    this.dbCluster = new ServerlessCluster(this, "db-cluster", {
      clusterIdentifier: `${envName}-${appName}-db-cluster`,
      engine: DatabaseClusterEngine.AURORA_POSTGRESQL,
      defaultDatabaseName: "postgres",
      credentials: {
        username: Credentials.fromSecret(props.dbSecret).username,
        secret: props.dbSecret
      },
      securityGroups: [props.dbSecurityGroup],
      subnetGroup: props.dbSubnetGroup,
      vpc: props.vpc,
      vpcSubnets: {
        availabilityZones: dbSubnets.map(v => v.availabilityZone),
        onePerAz: false,
        subnets: dbSubnets
      },
      scaling: {
        autoPause: Duration.days(1),
        minCapacity: AuroraCapacityUnit.ACU_2,
        maxCapacity: AuroraCapacityUnit.ACU_8
      }
    });

    new SecretTargetAttachment(this, "db-secret-target-attachment", {
      secret: props.dbSecret,
      target: this.dbCluster
    });
  }
}