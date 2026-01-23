#!/usr/bin/env python3
"""Fix the update_user method in espaluz_memory.py"""

with open('/home/ubuntu/EspaLuzFamilybot/espaluz_memory.py', 'r') as f:
    content = f.read()

# Fix the damaged code
old_code = '''    def update_user(self, user_id: int = None, **updates) -> bool:
        " \\Update user profile fields for the current user or specified user_id\\\\n if user_id is None:
 user_id = self.user_id
        """Update user profile fields"""
        if not updates:
            return False'''

new_code = '''    def update_user(self, user_id: int = None, **updates) -> bool:
        """Update user profile fields for the current user or specified user_id"""
        if user_id is None:
            user_id = self.user_id
        if not updates:
            return False'''

if old_code in content:
    content = content.replace(old_code, new_code)
    with open('/home/ubuntu/EspaLuzFamilybot/espaluz_memory.py', 'w') as f:
        f.write(content)
    print("✅ Fixed update_user method!")
else:
    # Try simpler fix
    old2 = '''    def update_user(self, user_id: int, **updates) -> bool:
        """Update user profile fields"""
        if not updates:
            return False'''
    
    new2 = '''    def update_user(self, user_id: int = None, **updates) -> bool:
        """Update user profile fields for the current user or specified user_id"""
        if user_id is None:
            user_id = self.user_id
        if not updates:
            return False'''
    
    if old2 in content:
        content = content.replace(old2, new2)
        with open('/home/ubuntu/EspaLuzFamilybot/espaluz_memory.py', 'w') as f:
            f.write(content)
        print("✅ Fixed update_user method (alternative)!")
    else:
        print("❌ Could not find code to fix")
        print("Looking for pattern...")
        if 'def update_user' in content:
            import re
            match = re.search(r'def update_user.*?(?=\n    def |\nclass |\Z)', content, re.DOTALL)
            if match:
                print(f"Found: {match.group()[:200]}...")
