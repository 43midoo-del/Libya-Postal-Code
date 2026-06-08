<?php
/**
 * Application-level settings (session name, display options).
 */
declare(strict_types=1);

return [
    'name'         => 'نظام إدارة العناوين البريدية (ليبيا)',
    'session_name' => 'LIBYA_POSTAL_SESSID',
    /** ربط توليد الكود البريدي بمنطكة في الجدول الهرمي حتى يتوافق مع الشعبيات لاحقاً */
    'default_postal_area_id' => 1,
    // Default route when opening index.php: login screen or dashboard if authenticated
    'default_route' => 'home',
    // When true, show exception messages on the generic error page and on login DB errors
    'debug'        => false,
];
