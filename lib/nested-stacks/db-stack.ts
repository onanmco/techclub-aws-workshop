import { Duration, NestedStack, NestedStackProps } from "aws-cdk-lib";
import { ISecurityGroup, IVpc } from "aws-cdk-lib/aws-ec2";
import { AuroraCapacityUnit, Credentials, DatabaseClusterEngine, ServerlessCluster, SubnetGroup } from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

interface DbStackProps extends NestedStackProps {
  envName: string;
  appName: string;
  vpc: IVpc,
  dbSecurityGroup: ISecurityGroup;
}

export class DbStack extends NestedStack {
  private readonly dbCluster: ServerlessCluster;

  public getDbCluster() {
    return this.dbCluster;
  }

  constructor(scope: Construct, id: string, props: DbStackProps) {
    super(scope, id, props);

    const { envName, appName } = props;

    this.dbCluster = new ServerlessCluster(this, "db-cluster", {
      clusterIdentifier: `${envName}-${appName}-db-cluster`,
      engine: DatabaseClusterEngine.AURORA_POSTGRESQL,
      defaultDatabaseName: "postgres",
      credentials: Credentials.fromGeneratedSecret(
        "admin",
        {
          secretName: `${envName}/${appName}/db-credentials`,
        }
      ),
      securityGroups: [props.dbSecurityGroup],
      vpc: props.vpc,
      vpcSubnets: {
        subnetGroupName: `${envName}-${appName}-private-rds-subnet`
      },
      subnetGroup: SubnetGroup.fromSubnetGroupName(this, "db-subnet-group", `${envName}-${appName}-private-rds-subnet`),
      scaling: {
        autoPause: Duration.days(1),
        minCapacity: AuroraCapacityUnit.ACU_2,
        maxCapacity: AuroraCapacityUnit.ACU_8
      },
      backupRetention: Duration.days(1),
      deletionProtection: false,
    });
  }
}