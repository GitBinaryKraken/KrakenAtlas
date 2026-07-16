using KrakenAtlas.Core;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Operations;

namespace KrakenAtlas.Analyzers.Roslyn;

internal static partial class CSharpFrameworkAnalyzer
{
    private static readonly HashSet<string> MiddlewareMethods = new(StringComparer.Ordinal)
    {
        "UseAuthentication",
        "UseAuthorization",
        "UseCors",
        "UseDeveloperExceptionPage",
        "UseExceptionHandler",
        "UseForwardedHeaders",
        "UseHsts",
        "UseHttpsRedirection",
        "UseMiddleware",
        "UseOutputCache",
        "UseRateLimiter",
        "UseResponseCaching",
        "UseRouting",
        "UseSession",
        "UseStaticFiles",
        "UseStatusCodePages",
        "UseWebSockets"
    };

    private static void CollectEndpointContracts(
        string workspaceKey,
        string projectKey,
        string endpointKey,
        IMethodSymbol handler,
        DiscoveredCodeLocation evidence,
        IReadOnlyDictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, string> projectKeysByAssembly,
        Action<DiscoveredCodeRelation> addRelation)
    {
        foreach (var parameter in handler.Parameters)
        {
            var binding = GetBindingSource(parameter);
            foreach (var contract in EnumerateContractTypes(parameter.Type))
            {
                var contractKey = CSharpDeclarationAnalyzer.ResolveKnownKey(
                    workspaceKey, projectKey, contract, symbols, projectKeysByAssembly);
                if (contractKey is null)
                {
                    continue;
                }
                addRelation(new DiscoveredCodeRelation(
                    endpointKey,
                    contractKey,
                    binding == "services" ? "resolves_parameter" : "binds_request",
                    null,
                    evidence,
                    "framework",
                    $"{binding}:{parameter.Name}"));
            }
        }

        foreach (var contract in EnumerateContractTypes(handler.ReturnType))
        {
            var contractKey = CSharpDeclarationAnalyzer.ResolveKnownKey(
                workspaceKey, projectKey, contract, symbols, projectKeysByAssembly);
            if (contractKey is not null)
            {
                addRelation(new DiscoveredCodeRelation(
                    endpointKey,
                    contractKey,
                    "returns_response",
                    null,
                    evidence,
                    "framework",
                    "declared"));
            }
        }
    }

    private static void CollectAuthorizationPolicies(
        string workspaceKey,
        string projectKey,
        string endpointKey,
        IEnumerable<AttributeData> attributes,
        DiscoveredCodeLocation evidence,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        Action<DiscoveredCodeRelation> addRelation)
    {
        var materialized = attributes.ToArray();
        if (materialized.Any(attribute =>
            attribute.AttributeClass?.ToDisplayString() == "Microsoft.AspNetCore.Authorization.AllowAnonymousAttribute"))
        {
            AppendSignatureDetail(symbols, endpointKey, "anonymous");
            return;
        }

        var authorizations = materialized.Where(attribute =>
            attribute.AttributeClass?.ToDisplayString() == "Microsoft.AspNetCore.Authorization.AuthorizeAttribute").ToArray();
        foreach (var authorization in authorizations)
        {
            var policy = GetConstructorString(authorization)
                ?? GetNamedAttributeString(authorization, "Policy")
                ?? (GetNamedAttributeString(authorization, "Roles") is { } roles ? $"roles:{roles}" : null)
                ?? "authenticated";
            AddAuthorizationPolicy(
                workspaceKey, projectKey, endpointKey, policy, evidence, symbols, addRelation);
        }
    }

    private static void CollectMinimalApiEndpoint(
        string workspaceKey,
        DiscoveredProject project,
        DiscoveredFile sourceFile,
        SemanticModel semanticModel,
        InvocationExpressionSyntax invocationSyntax,
        IInvocationOperation invocation,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, string> projectKeysByAssembly,
        ICollection<HttpEndpointFact> endpoints,
        Action<DiscoveredCodeRelation> addRelation,
        CancellationToken cancellationToken)
    {
        var verb = GetMinimalApiVerb(invocation.TargetMethod);
        if (verb is null || invocationSyntax.ArgumentList.Arguments.Count < 2)
        {
            return;
        }
        var route = ResolveMinimalApiRoute(invocationSyntax, semanticModel, cancellationToken);
        if (route is null)
        {
            return;
        }
        var evidence = CreateLocation(sourceFile, invocationSyntax);
        var sourceKey = CSharpDeclarationAnalyzer.ResolveSourceKey(
            workspaceKey,
            project.StableKey,
            semanticModel.GetEnclosingSymbol(invocationSyntax.SpanStart, cancellationToken),
            symbols);
        var endpointKey = CreateMinimalEndpointKey(
            workspaceKey, project.StableKey, sourceFile.RelativePath, invocationSyntax.SpanStart, verb, route);
        symbols[endpointKey] = new DiscoveredCodeSymbol(
            endpointKey,
            project.StableKey,
            "http_endpoint",
            $"{verb} {route}",
            $"{verb} {route}",
            $"{verb} {route} | minimal",
            "not_applicable",
            sourceKey,
            [evidence],
            "http");
        endpoints.Add(new HttpEndpointFact(endpointKey, verb, route, evidence));
        addRelation(new DiscoveredCodeRelation(
            sourceKey, endpointKey, "exposes_endpoint", null, evidence, "framework", "minimal_api"));

        var handlerExpression = invocationSyntax.ArgumentList.Arguments[1].Expression;
        var handlerEvidence = CreateLocation(sourceFile, handlerExpression);
        var handlerKey = CreateSyntheticKey("minimal_api_handler", endpointKey);
        var handlerSymbol = semanticModel.GetSymbolInfo(handlerExpression, cancellationToken).Symbol as IMethodSymbol;
        symbols[handlerKey] = new DiscoveredCodeSymbol(
            handlerKey,
            project.StableKey,
            "minimal_api_handler",
            $"{verb} {route} handler",
            $"{verb} {route} handler",
            handlerSymbol is null ? "minimal API lambda" : handlerSymbol.ToDisplayString(),
            "not_applicable",
            sourceKey,
            [handlerEvidence]);
        addRelation(new DiscoveredCodeRelation(
            endpointKey, handlerKey, "handled_by", "direct", handlerEvidence, "framework", "minimal_api"));

        if (handlerSymbol is not null)
        {
            CollectEndpointContracts(
                workspaceKey,
                project.StableKey,
                endpointKey,
                handlerSymbol,
                handlerEvidence,
                symbols,
                projectKeysByAssembly,
                addRelation);
            var directHandlerKey = CSharpDeclarationAnalyzer.ResolveKnownKey(
                workspaceKey, project.StableKey, handlerSymbol, symbols, projectKeysByAssembly);
            if (directHandlerKey is not null)
            {
                addRelation(new DiscoveredCodeRelation(
                    handlerKey,
                    directHandlerKey,
                    "dispatches_to",
                    "direct",
                    handlerEvidence,
                    "framework",
                    "minimal_api"));
            }
        }

        foreach (var nestedInvocation in handlerExpression.DescendantNodesAndSelf().OfType<InvocationExpressionSyntax>())
        {
            if (semanticModel.GetOperation(nestedInvocation, cancellationToken) is not IInvocationOperation nestedOperation)
            {
                continue;
            }
            var targetKey = CSharpDeclarationAnalyzer.ResolveKnownKey(
                workspaceKey,
                project.StableKey,
                nestedOperation.TargetMethod,
                symbols,
                projectKeysByAssembly);
            if (targetKey is not null)
            {
                addRelation(new DiscoveredCodeRelation(
                    handlerKey,
                    targetKey,
                    "calls",
                    nestedOperation.TargetMethod.IsVirtual ? "virtual" : "direct",
                    CreateLocation(sourceFile, nestedInvocation),
                    "code",
                    "minimal_api_handler"));
            }
        }
    }

    private static void CollectMinimalApiMetadata(
        string workspaceKey,
        DiscoveredProject project,
        DiscoveredFile sourceFile,
        SemanticModel semanticModel,
        InvocationExpressionSyntax invocationSyntax,
        IInvocationOperation invocation,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, string> projectKeysByAssembly,
        Action<DiscoveredCodeRelation> addRelation,
        CancellationToken cancellationToken)
    {
        var metadataKind = invocation.TargetMethod.Name;
        if (metadataKind is not ("RequireAuthorization" or "AllowAnonymous" or "Produces" or "Accepts"))
        {
            return;
        }
        var mapInvocation = invocationSyntax.DescendantNodesAndSelf()
            .OfType<InvocationExpressionSyntax>()
            .FirstOrDefault(candidate => semanticModel.GetOperation(candidate, cancellationToken) is IInvocationOperation operation
                && GetMinimalApiVerb(operation.TargetMethod) is not null);
        if (mapInvocation is null
            || semanticModel.GetOperation(mapInvocation, cancellationToken) is not IInvocationOperation mapOperation
            || GetMinimalApiVerb(mapOperation.TargetMethod) is not { } verb
            || mapInvocation.ArgumentList.Arguments.Count == 0
            || ResolveMinimalApiRoute(mapInvocation, semanticModel, cancellationToken) is not { } route)
        {
            return;
        }
        var endpointKey = CreateMinimalEndpointKey(
            workspaceKey, project.StableKey, sourceFile.RelativePath, mapInvocation.SpanStart, verb, route);
        var evidence = CreateLocation(sourceFile, invocationSyntax);

        if (metadataKind == "AllowAnonymous")
        {
            AppendSignatureDetail(symbols, endpointKey, "anonymous");
            return;
        }
        if (metadataKind == "RequireAuthorization")
        {
            var policies = invocationSyntax.ArgumentList.Arguments
                .Select(argument => ExtractStringTemplate(argument.Expression, semanticModel, cancellationToken))
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Cast<string>()
                .ToArray();
            foreach (var policy in policies.Length == 0 ? ["authenticated"] : policies)
            {
                AddAuthorizationPolicy(
                    workspaceKey, project.StableKey, endpointKey, policy, evidence, symbols, addRelation);
            }
            return;
        }

        var contract = invocation.TargetMethod.TypeArguments.FirstOrDefault() as INamedTypeSymbol;
        var contractKey = contract is null
            ? null
            : CSharpDeclarationAnalyzer.ResolveKnownKey(
                workspaceKey, project.StableKey, contract, symbols, projectKeysByAssembly);
        if (contractKey is not null)
        {
            addRelation(new DiscoveredCodeRelation(
                endpointKey,
                contractKey,
                metadataKind == "Produces" ? "returns_response" : "binds_request",
                null,
                evidence,
                "framework",
                "endpoint_metadata"));
        }
    }

    private static void CollectMiddleware(
        string workspaceKey,
        DiscoveredProject project,
        DiscoveredFile sourceFile,
        SemanticModel semanticModel,
        InvocationExpressionSyntax invocationSyntax,
        IInvocationOperation invocation,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        IReadOnlyDictionary<string, string> projectKeysByAssembly,
        ICollection<MiddlewareFact> middleware,
        Action<DiscoveredCodeRelation> addRelation,
        CancellationToken cancellationToken)
    {
        var original = invocation.TargetMethod.ReducedFrom ?? invocation.TargetMethod;
        var methodName = original.Name;
        var isInline = methodName is "Use" or "Run";
        if ((!MiddlewareMethods.Contains(methodName) && !isInline)
            || !original.ContainingNamespace.ToDisplayString().StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal))
        {
            return;
        }

        var middlewareType = methodName == "UseMiddleware"
            ? invocation.TargetMethod.TypeArguments.FirstOrDefault() as INamedTypeSymbol
            : null;
        var displayName = middlewareType?.ToDisplayString()
            ?? (isInline ? $"inline {methodName.ToLowerInvariant()}" : methodName[3..]);
        var evidence = CreateLocation(sourceFile, invocationSyntax);
        var sourceKey = CSharpDeclarationAnalyzer.ResolveSourceKey(
            workspaceKey,
            project.StableKey,
            semanticModel.GetEnclosingSymbol(invocationSyntax.SpanStart, cancellationToken),
            symbols);
        var middlewareKey = CreateSyntheticKey(
            "middleware",
            $"{workspaceKey}|{project.StableKey}|{sourceFile.RelativePath}|{invocationSyntax.SpanStart}|{displayName}");
        symbols[middlewareKey] = new DiscoveredCodeSymbol(
            middlewareKey,
            project.StableKey,
            "middleware",
            displayName.Split('.').Last(),
            displayName,
            $"ASP.NET Core middleware | {methodName}",
            "not_applicable",
            sourceKey,
            [evidence],
            "csharp");
        middleware.Add(new MiddlewareFact(
            middlewareKey, sourceKey, sourceFile.RootPath, sourceFile.RelativePath, invocationSyntax.SpanStart, evidence));

        if (middlewareType is not null)
        {
            var typeKey = CSharpDeclarationAnalyzer.ResolveKnownKey(
                workspaceKey, project.StableKey, middlewareType, symbols, projectKeysByAssembly);
            if (typeKey is not null)
            {
                addRelation(new DiscoveredCodeRelation(
                    middlewareKey,
                    typeKey,
                    "implemented_by",
                    "direct",
                    evidence,
                    "framework",
                    "UseMiddleware"));
            }
        }
    }

    private static void ConnectMiddlewarePipeline(
        IReadOnlyList<MiddlewareFact> middleware,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        Action<DiscoveredCodeRelation> addRelation)
    {
        foreach (var pipeline in middleware.GroupBy(item =>
            (item.SourceKey, item.RootPath, item.RelativePath)))
        {
            var ordered = pipeline.OrderBy(item => item.SpanStart).ToArray();
            for (var index = 0; index < ordered.Length; index++)
            {
                var current = ordered[index];
                var order = $"order:{index + 1}";
                AppendSignatureDetail(symbols, current.EntityKey, order);
                addRelation(new DiscoveredCodeRelation(
                    current.SourceKey,
                    current.EntityKey,
                    "uses_middleware",
                    null,
                    current.Evidence,
                    "framework",
                    order));
                if (index > 0)
                {
                    addRelation(new DiscoveredCodeRelation(
                        ordered[index - 1].EntityKey,
                        current.EntityKey,
                        "precedes",
                        "static",
                        current.Evidence,
                        "framework",
                        "source_order"));
                }
            }
        }
    }

    private static void AddAuthorizationPolicy(
        string workspaceKey,
        string projectKey,
        string endpointKey,
        string policy,
        DiscoveredCodeLocation evidence,
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        Action<DiscoveredCodeRelation> addRelation)
    {
        var policyKey = CreateSyntheticKey("authorization_policy", $"{workspaceKey}|{policy}");
        if (!symbols.ContainsKey(policyKey))
        {
            symbols[policyKey] = new DiscoveredCodeSymbol(
                policyKey,
                projectKey,
                "authorization_policy",
                policy,
                policy,
                $"ASP.NET Core authorization policy | {policy}",
                "not_applicable",
                null,
                [evidence],
                "csharp");
        }
        AppendSignatureDetail(symbols, endpointKey, $"policy {policy}");
        addRelation(new DiscoveredCodeRelation(
            endpointKey, policyKey, "requires_policy", null, evidence, "framework", policy));
    }

    private static IEnumerable<INamedTypeSymbol> EnumerateContractTypes(ITypeSymbol type)
    {
        if (type is IArrayTypeSymbol array)
        {
            foreach (var item in EnumerateContractTypes(array.ElementType))
            {
                yield return item;
            }
            yield break;
        }
        if (type is not INamedTypeSymbol named || named.SpecialType != SpecialType.None)
        {
            yield break;
        }
        if (!IsContractWrapper(named))
        {
            yield return named;
        }
        foreach (var argument in named.TypeArguments)
        {
            foreach (var item in EnumerateContractTypes(argument))
            {
                yield return item;
            }
        }
    }

    private static bool IsContractWrapper(INamedTypeSymbol type)
    {
        var qualifiedName = type.OriginalDefinition.ToDisplayString();
        return qualifiedName.StartsWith("System.Threading.Tasks.Task<", StringComparison.Ordinal)
            || qualifiedName.StartsWith("System.Threading.Tasks.ValueTask<", StringComparison.Ordinal)
            || qualifiedName.StartsWith("Microsoft.AspNetCore.Mvc.ActionResult<", StringComparison.Ordinal)
            || qualifiedName.StartsWith("System.Collections.Generic.IEnumerable<", StringComparison.Ordinal)
            || qualifiedName.StartsWith("System.Collections.Generic.IReadOnly", StringComparison.Ordinal)
            || qualifiedName.StartsWith("System.Collections.Generic.List<", StringComparison.Ordinal)
            || qualifiedName.StartsWith("System.Nullable<", StringComparison.Ordinal);
    }

    private static string GetBindingSource(IParameterSymbol parameter)
    {
        foreach (var attribute in parameter.GetAttributes())
        {
            var source = attribute.AttributeClass?.Name switch
            {
                "FromBodyAttribute" => "body",
                "FromFormAttribute" => "form",
                "FromHeaderAttribute" => "header",
                "FromQueryAttribute" => "query",
                "FromRouteAttribute" => "route",
                "FromServicesAttribute" or "FromKeyedServicesAttribute" => "services",
                _ => null
            };
            if (source is not null)
            {
                return source;
            }
        }
        return parameter.Type.TypeKind == TypeKind.Interface ? "services" : "inferred";
    }

    private static string? GetMinimalApiVerb(IMethodSymbol method)
    {
        var original = method.ReducedFrom ?? method;
        if (!original.ContainingNamespace.ToDisplayString().StartsWith("Microsoft.AspNetCore.Builder", StringComparison.Ordinal))
        {
            return null;
        }
        return original.Name switch
        {
            "MapGet" => "GET",
            "MapPost" => "POST",
            "MapPut" => "PUT",
            "MapPatch" => "PATCH",
            "MapDelete" => "DELETE",
            _ => null
        };
    }

    private static string? ResolveMinimalApiRoute(
        InvocationExpressionSyntax invocation,
        SemanticModel semanticModel,
        CancellationToken cancellationToken)
    {
        if (invocation.ArgumentList.Arguments.Count == 0
            || ExtractStringTemplate(
                invocation.ArgumentList.Arguments[0].Expression,
                semanticModel,
                cancellationToken) is not { } route)
        {
            return null;
        }
        var receiver = (invocation.Expression as MemberAccessExpressionSyntax)?.Expression;
        var prefix = receiver is null
            ? null
            : ResolveRouteGroupPrefix(receiver, semanticModel, cancellationToken, 0);
        return NormalizeRoute(string.Join('/', new[] { prefix, route }
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!.Trim('/'))));
    }

    private static string? ResolveRouteGroupPrefix(
        ExpressionSyntax expression,
        SemanticModel semanticModel,
        CancellationToken cancellationToken,
        int depth)
    {
        if (depth >= 8)
        {
            return null;
        }
        if (expression is InvocationExpressionSyntax invocation
            && semanticModel.GetOperation(invocation, cancellationToken) is IInvocationOperation operation
            && operation.TargetMethod.Name == "MapGroup"
            && invocation.ArgumentList.Arguments.Count > 0)
        {
            var current = ExtractStringTemplate(
                invocation.ArgumentList.Arguments[0].Expression,
                semanticModel,
                cancellationToken);
            var parentReceiver = (invocation.Expression as MemberAccessExpressionSyntax)?.Expression;
            var parent = parentReceiver is null
                ? null
                : ResolveRouteGroupPrefix(parentReceiver, semanticModel, cancellationToken, depth + 1);
            return string.Join('/', new[] { parent, current }
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Select(value => value!.Trim('/')));
        }
        if (semanticModel.GetSymbolInfo(expression, cancellationToken).Symbol is ILocalSymbol local
            && local.DeclaringSyntaxReferences.FirstOrDefault()?.GetSyntax(cancellationToken)
                is VariableDeclaratorSyntax { Initializer.Value: { } initializer })
        {
            return ResolveRouteGroupPrefix(initializer, semanticModel, cancellationToken, depth + 1);
        }
        return null;
    }

    private static string CreateMinimalEndpointKey(
        string workspaceKey,
        string projectKey,
        string relativePath,
        int spanStart,
        string verb,
        string route) => CreateSyntheticKey(
            "http_endpoint",
            $"{workspaceKey}|{projectKey}|{relativePath}|{spanStart}|{verb}|{route}|minimal");

    private static string? GetNamedAttributeString(AttributeData attribute, string name) =>
        attribute.NamedArguments.FirstOrDefault(argument => argument.Key == name).Value.Value as string;

    private static void AppendSignatureDetail(
        Dictionary<string, DiscoveredCodeSymbol> symbols,
        string entityKey,
        string detail)
    {
        if (!symbols.TryGetValue(entityKey, out var entity)
            || entity.Signature?.Split('|', StringSplitOptions.TrimEntries).Contains(detail, StringComparer.Ordinal) == true)
        {
            return;
        }
        symbols[entityKey] = entity with
        {
            Signature = string.IsNullOrWhiteSpace(entity.Signature)
                ? detail
                : $"{entity.Signature} | {detail}"
        };
    }

    private sealed record MiddlewareFact(
        string EntityKey,
        string SourceKey,
        string RootPath,
        string RelativePath,
        int SpanStart,
        DiscoveredCodeLocation Evidence);
}
