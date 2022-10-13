import { NestedStack, NestedStackProps } from "aws-cdk-lib";
import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

interface SecretsStackProps extends NestedStackProps {
  envName: string;
  appName: string;
}

export class SecretsStack extends NestedStack {
  private readonly dbSecret: ISecret;

  public getDbSecret() {
    return this.dbSecret;
  }

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);

    const { envName, appName } = props;

    this.dbSecret = new Secret(this, "db-secret", {
      secretName: `${envName}/${appName}/db/credentials`,
      description: "RDS database credentials",
      generateSecretString: {
        secretStringTemplate: "{\"username\": \"admin\"}",
        generateStringKey: "password",
        passwordLength: 32,
        excludeCharacters: "/@\"'\\",
        includeSpace: false
      }
    });
  }
}