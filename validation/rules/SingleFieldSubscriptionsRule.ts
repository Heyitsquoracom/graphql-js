import type { ObjMap } from '../../jsutils/ObjMap.ts';
import { GraphQLError } from '../../error/GraphQLError.ts';
import type { ASTVisitor } from '../../language/visitor.ts';
import type {
  OperationDefinitionNode,
  FragmentDefinitionNode,
} from '../../language/ast.ts';
import { Kind } from '../../language/kinds.ts';
import type { ValidationContext } from '../ValidationContext.ts';
import type { ExecutionContext } from '../../execution/execute.ts';
import {
  collectFields,
  defaultFieldResolver,
  defaultTypeResolver,
} from '../../execution/execute.ts';
/**
 * Subscriptions must only include a non-introspection field.
 *
 * A GraphQL subscription is valid only if it contains a single root field and
 * that root field is not an introspection field.
 */

export function SingleFieldSubscriptionsRule(
  context: ValidationContext,
): ASTVisitor {
  return {
    OperationDefinition(node: OperationDefinitionNode) {
      if (node.operation === 'subscription') {
        const schema = context.getSchema();
        const subscriptionType = schema.getSubscriptionType();

        if (subscriptionType) {
          const operationName = node.name ? node.name.value : null;
          const variableValues: {
            [variable: string]: any;
          } = Object.create(null);
          const document = context.getDocument();
          const fragments: ObjMap<FragmentDefinitionNode> = Object.create(null);

          for (const definition of document.definitions) {
            if (definition.kind === Kind.FRAGMENT_DEFINITION) {
              fragments[definition.name.value] = definition;
            }
          } // FIXME: refactor out `collectFields` into utility function that doesn't need fake context.

          const fakeExecutionContext: ExecutionContext = {
            schema,
            fragments,
            rootValue: undefined,
            contextValue: undefined,
            operation: node,
            variableValues,
            fieldResolver: defaultFieldResolver,
            typeResolver: defaultTypeResolver,
            errors: [],
          };
          const fields = collectFields(
            fakeExecutionContext,
            subscriptionType,
            node.selectionSet,
            new Map(),
            new Set(),
          );

          if (fields.size > 1) {
            const fieldSelectionLists = [...fields.values()];
            const extraFieldSelectionLists = fieldSelectionLists.slice(1);
            const extraFieldSelections = extraFieldSelectionLists.flat();
            context.reportError(
              new GraphQLError(
                operationName != null
                  ? `Subscription "${operationName}" must select only one top level field.`
                  : 'Anonymous Subscription must select only one top level field.',
                extraFieldSelections,
              ),
            );
          }

          for (const fieldNodes of fields.values()) {
            const field = fieldNodes[0];
            const fieldName = field.name.value;

            if (fieldName[0] === '_' && fieldName[1] === '_') {
              context.reportError(
                new GraphQLError(
                  operationName != null
                    ? `Subscription "${operationName}" must not select an introspection top level field.`
                    : 'Anonymous Subscription must not select an introspection top level field.',
                  fieldNodes,
                ),
              );
            }
          }
        }
      }
    },
  };
}